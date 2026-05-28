const AsteriskManager = require("asterisk-manager") as unknown as new (
  port: number,
  host: string,
  user: string,
  password: string,
  events: boolean,
) => AsteriskManagerInstance;

interface AsteriskManagerInstance {
  on(event: "connect", cb: () => void): void;
  on(event: "close", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "managerevent", cb: (evt: ManagerEvent) => void): void;
  action(req: Record<string, string>, cb?: (err: Error | null, res: unknown) => void): void;
  disconnect(): void;
  keepConnected(): void;
}

interface ManagerEvent {
  event: string;
  uniqueid?: string;
  linkedid?: string;
  channel?: string;
  channelstate?: string;
  channelstatedesc?: string;
  calleridnum?: string;
  calleridname?: string;
  connectedlinenum?: string;
  exten?: string;
  context?: string;
  destuniqueid?: string;
  destchannel?: string;
  destexten?: string;
  cause?: string;
  cause_txt?: string;
  duration?: string;
  billableseconds?: string;
  dialstatus?: string;
  src?: string;
  dst?: string;
  recordingfile?: string;
}

import type {
  AmiCallCompleted,
  AmiCallEvent,
  AmiCallStarted,
  AmiClient,
  AmiOriginateRequest,
} from "./ami-client";

interface PendingCall {
  cdrUniqueId: string;
  tenantId: string;
  fromNumber: string;
  toNumber: string;
  operatorId?: string;
  direction: "INBOUND" | "OUTBOUND";
  startedAt: Date;
  answered: boolean;
}

/**
 * Real Asterisk Manager Interface client. Uses the `asterisk-manager` npm
 * package to subscribe to manager events and to issue Originate actions.
 *
 * Per-call lifecycle we observe:
 *   Newchannel  → call appears
 *   DialBegin   → ringing
 *   DialEnd     → answered (DialStatus=ANSWER) or other (NOANSWER/BUSY/...)
 *   Hangup      → call ended; Cause + duration available
 *
 * Tenant resolution: AMI doesn't know about tenants. We run one worker per
 * tenant via `AMI_TENANT_ID` env. Multi-tenant routing (one worker, multiple
 * trunks) is a future iteration.
 */
export class AsteriskAmiClient implements AmiClient {
  readonly name = "asterisk";
  private ami: AsteriskManagerInstance | null = null;
  private startedHandlers: Array<(e: AmiCallStarted) => void | Promise<void>> = [];
  private incomingHandlers: Array<(e: AmiCallEvent) => void | Promise<void>> = [];
  private completedHandlers: Array<(e: AmiCallCompleted) => void | Promise<void>> = [];
  private pending = new Map<string, PendingCall>();

  constructor(
    private readonly config: {
      host: string;
      port: number;
      username: string;
      password: string;
      tenantId: string;
    },
  ) {}

  async connect(): Promise<void> {
    if (!this.config.host || !this.config.username || !this.config.password) {
      throw new Error(
        "AsteriskAmiClient: AMI_HOST/AMI_USERNAME/AMI_PASSWORD must be set",
      );
    }
    if (!this.config.tenantId) {
      throw new Error(
        "AsteriskAmiClient: AMI_TENANT_ID must be set (the tenant this PBX serves)",
      );
    }
    this.ami = new AsteriskManager(
      this.config.port,
      this.config.host,
      this.config.username,
      this.config.password,
      true,
    );
    this.ami.keepConnected();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("AMI connect timed out after 10s"));
      }, 10_000);
      this.ami!.on("connect", () => {
        clearTimeout(timeout);
        console.log(`Asterisk AMI connected at ${this.config.host}:${this.config.port}`);
        resolve();
      });
      this.ami!.on("error", (err) => {
        clearTimeout(timeout);
        console.error("AMI error:", err.message);
        reject(err);
      });
      this.ami!.on("close", () => {
        console.warn("AMI connection closed (keepConnected will retry)");
      });
      this.ami!.on("managerevent", (evt) => {
        void this.handleEvent(evt);
      });
    });
  }

  async disconnect(): Promise<void> {
    this.ami?.disconnect();
    this.ami = null;
  }

  onStarted(h: (e: AmiCallStarted) => void | Promise<void>): void {
    this.startedHandlers.push(h);
  }

  onIncoming(h: (e: AmiCallEvent) => void | Promise<void>): void {
    this.incomingHandlers.push(h);
  }

  onCompleted(h: (e: AmiCallCompleted) => void | Promise<void>): void {
    this.completedHandlers.push(h);
  }

  async originate(req: AmiOriginateRequest): Promise<void> {
    if (!this.ami) {
      throw new Error("AsteriskAmiClient.originate: not connected");
    }
    // Track this outbound call so we can map the eventual Hangup back to
    // the CRM-issued cdrUniqueId / operatorId.
    this.pending.set(req.cdrUniqueId, {
      cdrUniqueId: req.cdrUniqueId,
      tenantId: req.tenantId,
      fromNumber: req.fromExtension,
      toNumber: req.toNumber,
      operatorId: req.operatorId,
      direction: "OUTBOUND",
      startedAt: new Date(),
      answered: false,
    });

    // Originate via the SIP extension associated with the operator. FreePBX
    // typically maps operators to extensions in the 1xx-7xx range.
    await new Promise<void>((resolve, reject) => {
      this.ami!.action(
        {
          Action: "Originate",
          Channel: `PJSIP/${req.fromExtension}`,
          // Call the destination over an outbound trunk via the PBX dialplan.
          // The "from-internal" context is standard FreePBX.
          Context: "from-internal",
          Exten: req.toNumber,
          Priority: "1",
          CallerID: `${req.operatorId} <${req.fromExtension}>`,
          ActionID: req.cdrUniqueId,
          Async: "true",
          Variable: `__ACOUSTIC_CDR_ID=${req.cdrUniqueId}`,
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  // ===== AMI event router =====

  private async handleEvent(evt: ManagerEvent): Promise<void> {
    const name = (evt.event ?? "").toLowerCase();
    const uniqueId = evt.uniqueid ?? evt.linkedid;
    if (!uniqueId) return;

    if (name === "newchannel") {
      const from = evt.calleridnum ?? "";
      const to = evt.exten ?? "";
      const isFromExtension = /^\d{2,5}$/.test(from);
      const direction: "INBOUND" | "OUTBOUND" = isFromExtension ? "OUTBOUND" : "INBOUND";

      if (direction === "OUTBOUND" && !this.pending.has(uniqueId)) {
        for (const [, p] of this.pending) {
          if (p.fromNumber === from && !p.answered) {
            this.pending.delete(p.cdrUniqueId);
            this.pending.set(uniqueId, p);
            break;
          }
        }
      }

      if (direction === "INBOUND" && !this.pending.has(uniqueId)) {
        // Skip channels without a usable external caller number — Asterisk
        // emits Newchannel for internal/Local/feature-code channels too,
        // which are not real customer calls.
        if (!isUsableExternalNumber(from)) {
          return;
        }
        const entry: PendingCall = {
          cdrUniqueId: uniqueId,
          tenantId: this.config.tenantId,
          fromNumber: from,
          toNumber: to,
          operatorId: undefined,
          direction: "INBOUND",
          startedAt: new Date(),
          answered: false,
        };
        this.pending.set(uniqueId, entry);
        // Create the Call row eagerly (RINGING) so it's never lost even if
        // unanswered, then fire the screen-pop.
        await this.fanIn(this.startedHandlers, {
          cdrUniqueId: entry.cdrUniqueId,
          tenantId: entry.tenantId,
          fromNumber: entry.fromNumber,
          toNumber: entry.toNumber,
          direction: "INBOUND",
          startedAt: entry.startedAt.toISOString(),
        });
        await this.fanIn(this.incomingHandlers, {
          cdrUniqueId: entry.cdrUniqueId,
          tenantId: entry.tenantId,
          fromNumber: entry.fromNumber,
          toNumber: entry.toNumber,
        });
      }
    } else if (name === "dialend") {
      const entry = this.pending.get(uniqueId);
      if (entry) {
        entry.answered = (evt.dialstatus ?? "").toUpperCase() === "ANSWER";
      }
    } else if (name === "hangup") {
      const entry = this.pending.get(uniqueId);
      if (!entry) return;
      const duration = Number(evt.billableseconds ?? evt.duration ?? 0);
      const causeCode = String(evt.cause ?? "");
      const status: "ANSWERED" | "MISSED" | "BUSY" | "FAILED" = entry.answered
        ? "ANSWERED"
        : causeCode === "17"
          ? "BUSY"
          : entry.direction === "INBOUND"
            ? "MISSED"
            : "FAILED";
      this.pending.delete(uniqueId);
      await this.fanIn(this.completedHandlers, {
        cdrUniqueId: entry.cdrUniqueId,
        tenantId: entry.tenantId,
        fromNumber: entry.fromNumber,
        toNumber: entry.toNumber,
        operatorId: entry.operatorId,
        direction: entry.direction,
        status,
        startedAt: entry.startedAt.toISOString(),
        duration: Number.isFinite(duration) ? duration : 0,
        recordingUrl: evt.recordingfile,
      });
    }
  }

  private async fanIn<T>(handlers: Array<(e: T) => void | Promise<void>>, evt: T): Promise<void> {
    for (const h of handlers) await h(evt);
  }
}

/**
 * A "real" external number has at least 7 digits (local landline minimum).
 * Internal extensions (2-5 digits), empty caller IDs, and feature codes are
 * filtered out so we only screen-pop genuine customer calls.
 */
function isUsableExternalNumber(num: string): boolean {
  const digits = (num ?? "").replace(/\D/g, "");
  return digits.length >= 7;
}
