import { createServer, type Server, type Socket } from "node:net";
import { AgiChannel, parseAgiHandshake } from "./agi-protocol";
import type { CallHandler } from "./call-handler";

export interface AgiServerOpts {
  port: number;
  host?: string;
  /** Factory called once per connection — the handler owns the conversation. */
  createHandler: (channel: AgiChannel) => CallHandler;
}

/**
 * FastAGI server. FreePBX dialplan routes a call to us with
 * `exten => s,1,AGI(agi://host:4573)`. Each call opens its own TCP connection,
 * sends env headers, then waits for our commands.
 *
 * The handshake is bounded — Asterisk sends ~20 headers and a blank line in
 * one or two packets. We accumulate chunks until the blank-line terminator.
 */
export function startAgiServer(opts: AgiServerOpts): Server {
  const server = createServer((socket: Socket) => {
    socket.setNoDelay(true);
    socket.setEncoding("utf8");
    let buf = "";
    let promoted = false;

    const onData = (chunk: string): void => {
      if (promoted) return; // ownership has moved to AgiChannel
      buf += chunk;
      const parsed = parseAgiHandshake(buf);
      if (!parsed) return;
      promoted = true;
      socket.off("data", onData);
      const channel = new AgiChannel(parsed.env, socket, parsed.rest);
      const handler = opts.createHandler(channel);
      handler.handle().catch((err: Error) => {
        console.error(
          `[voice-ai] handler error on channel=${parsed.env.channel} uid=${parsed.env.uniqueId}: ${err.message}`,
        );
        try {
          if (!channel.isClosed()) {
            void channel.hangup();
          }
          socket.destroy();
        } catch {
          // Socket already gone — nothing to clean up.
        }
      });
    };

    socket.on("data", onData);
    socket.on("error", (err) => {
      console.error(`[voice-ai] socket error: ${err.message}`);
    });
  });

  server.listen(opts.port, opts.host ?? "0.0.0.0", () => {
    console.log(`[voice-ai] AGI server listening on ${opts.host ?? "0.0.0.0"}:${opts.port}`);
  });
  return server;
}
