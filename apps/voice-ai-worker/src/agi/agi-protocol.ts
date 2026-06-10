/**
 * Minimal raw Asterisk AGI (FastAGI) protocol parser. AGI on a TCP socket is
 * line-based — Asterisk first sends env headers (`agi_channel: ...`) ending
 * with a blank line, then waits for newline-terminated commands and replies
 * with `200 result=<n>[ data]` (or `5xx` on error).
 *
 * We avoid pulling a third-party AGI lib so the worker stays inside the
 * monorepo's existing dep budget — the protocol is small enough to host here.
 */

import type { Socket } from "node:net";

export interface AgiEnv {
  channel: string;
  callerIdNum: string;
  callerIdName: string;
  uniqueId: string;
  context: string;
  extension: string;
  language?: string;
  dnid?: string;
  request?: string;
  raw: Record<string, string>;
}

/**
 * Read AGI env headers off the socket up to the terminating blank line.
 * Returns parsed env + the buffered carry (bytes that arrived after the blank
 * line but before we started reading commands — usually empty).
 */
export function parseAgiHandshake(buf: string): { env: AgiEnv; rest: string } | null {
  // Need the terminating blank line ("\n\n") before we can parse.
  const headerEnd = buf.indexOf("\n\n");
  if (headerEnd === -1) return null;
  const headerBlock = buf.slice(0, headerEnd);
  const rest = buf.slice(headerEnd + 2);
  const raw: Record<string, string> = {};
  for (const line of headerBlock.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key) raw[key] = value;
  }
  const env: AgiEnv = {
    channel: raw["agi_channel"] ?? "",
    callerIdNum: raw["agi_callerid"] ?? "",
    callerIdName: raw["agi_calleridname"] ?? "",
    uniqueId: raw["agi_uniqueid"] ?? "",
    context: raw["agi_context"] ?? "",
    extension: raw["agi_extension"] ?? "",
    language: raw["agi_language"],
    dnid: raw["agi_dnid"],
    request: raw["agi_request"],
    raw,
  };
  return { env, rest };
}

/**
 * Parse an AGI response line. Format: `200 result=<value>[ data]` for success,
 * `5xx ...` for hangup / invalid. We only inspect `result` and `data`.
 */
export interface AgiResponse {
  code: number;
  result: string;
  data?: string;
  raw: string;
}

export function parseAgiResponse(line: string): AgiResponse {
  const trimmed = line.trim();
  const code = Number(trimmed.slice(0, 3));
  const rest = trimmed.slice(4);
  // result is the first token; data is whatever follows in parens or after.
  const match = rest.match(/result=(\S+)(?:\s+(.*))?$/);
  return {
    code: Number.isFinite(code) ? code : 0,
    result: match?.[1] ?? "",
    data: match?.[2],
    raw: trimmed,
  };
}

/**
 * Async-iterable wrapper around the AGI socket. Buffers incoming data and
 * yields parsed responses one at a time. Caller drives the loop by sending
 * commands via `send()` and awaiting `nextResponse()`.
 */
export class AgiChannel {
  private buffer = "";
  private pending: ((line: string) => void) | null = null;
  private closed = false;

  constructor(
    public readonly env: AgiEnv,
    private readonly socket: Socket,
    initialCarry: string,
  ) {
    this.buffer = initialCarry;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
    socket.on("close", () => {
      this.closed = true;
      this.drain();
    });
    socket.on("error", () => {
      this.closed = true;
      this.drain();
    });
  }

  private drain(): void {
    while (this.pending) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) {
        if (this.closed) {
          const resume = this.pending;
          this.pending = null;
          resume("");
        }
        return;
      }
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      const resume = this.pending;
      this.pending = null;
      resume(line);
    }
  }

  private nextLine(): Promise<string> {
    return new Promise((resolve) => {
      this.pending = resolve;
      this.drain();
    });
  }

  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Send a single AGI command and read back the first response line. Some
   * commands (HANGUP) produce 5xx and we accept those rather than throwing —
   * the caller decides whether to abort the conversation.
   */
  async send(command: string): Promise<AgiResponse> {
    if (this.closed) {
      return { code: 511, result: "-1", raw: "511 Channel closed" };
    }
    this.socket.write(`${command}\n`);
    const line = await this.nextLine();
    if (!line) {
      this.closed = true;
      return { code: 511, result: "-1", raw: "511 Channel closed" };
    }
    return parseAgiResponse(line);
  }

  // --- High-level helpers (composed of `send()` underneath) -----------------

  answer(): Promise<AgiResponse> {
    return this.send("ANSWER");
  }

  hangup(): Promise<AgiResponse> {
    return this.send("HANGUP");
  }

  streamFile(path: string, escapeDigits = ""): Promise<AgiResponse> {
    return this.send(`STREAM FILE "${path}" "${escapeDigits}"`);
  }

  /**
   * RECORD FILE captures the channel audio to disk. Asterisk records into
   * `${ASTSPOOLDIR}/<file>.<format>`. We always use `sln16` (16kHz signed
   * linear) so Google STT can read it natively — though FreePBX trunks may
   * downsample to 8kHz, this is the channel's native rate.
   *
   * silence_seconds controls VAD-style end-of-utterance detection.
   * maxDurationMs is a hard cap so we never get stuck if VAD misfires.
   */
  recordFile(opts: {
    path: string;
    format?: "wav" | "sln" | "sln16" | "gsm";
    escapeDigits?: string;
    maxDurationMs?: number;
    silenceSeconds?: number;
    beep?: boolean;
  }): Promise<AgiResponse> {
    const fmt = opts.format ?? "sln16";
    const esc = opts.escapeDigits ?? "#";
    const ms = opts.maxDurationMs ?? 30_000;
    const beep = opts.beep ? "BEEP" : "";
    const silence = opts.silenceSeconds ?? 3;
    return this.send(
      `RECORD FILE "${opts.path}" ${fmt} "${esc}" ${ms} ${beep} s=${silence}`.trim(),
    );
  }

  getVariable(name: string): Promise<AgiResponse> {
    return this.send(`GET VARIABLE ${name}`);
  }

  setVariable(name: string, value: string): Promise<AgiResponse> {
    return this.send(`SET VARIABLE ${name} "${value}"`);
  }

  exec(app: string, args: string): Promise<AgiResponse> {
    return this.send(`EXEC ${app} "${args}"`);
  }

  noop(message: string): Promise<AgiResponse> {
    // Useful for logging into Asterisk's verbose output during debugging.
    return this.send(`NOOP "${message.replace(/"/g, '\\"')}"`);
  }
}
