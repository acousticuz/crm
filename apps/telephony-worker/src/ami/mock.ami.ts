import type {
  AmiCallCompleted,
  AmiCallEvent,
  AmiCallStarted,
  AmiClient,
  AmiOriginateRequest,
} from "./ami-client";

type StartedHandler = (e: AmiCallStarted) => void | Promise<void>;
type IncomingHandler = (e: AmiCallEvent) => void | Promise<void>;
type CompletedHandler = (e: AmiCallCompleted) => void | Promise<void>;

/**
 * Deterministic in-process AMI mock. Exposes `simulateInbound` /
 * `simulateOutbound` / `simulateMissed` so tests and the dev REPL can drive
 * the worker without a real PBX. Each simulation emits started → completed so
 * the full lifecycle (RINGING then final status) is exercised.
 */
export class MockAmiClient implements AmiClient {
  readonly name = "mock";
  private started: StartedHandler[] = [];
  private incoming: IncomingHandler[] = [];
  private completed: CompletedHandler[] = [];

  async connect(): Promise<void> {
    /* no-op */
  }

  async disconnect(): Promise<void> {
    /* no-op */
  }

  onStarted(h: StartedHandler): void {
    this.started.push(h);
  }

  onIncoming(h: IncomingHandler): void {
    this.incoming.push(h);
  }

  onCompleted(h: CompletedHandler): void {
    this.completed.push(h);
  }

  async originate(req: AmiOriginateRequest): Promise<void> {
    const startedAt = new Date().toISOString();
    const base: AmiCallEvent = {
      cdrUniqueId: req.cdrUniqueId,
      tenantId: req.tenantId,
      fromNumber: req.fromExtension,
      toNumber: req.toNumber,
      operatorId: req.operatorId,
    };
    await this.fanIn(this.started, { ...base, direction: "OUTBOUND", startedAt });
    await this.fanIn(this.completed, {
      ...base,
      direction: "OUTBOUND",
      status: "ANSWERED",
      startedAt,
      duration: 30,
      recordingUrl: `mock://recordings/${req.cdrUniqueId}.wav`,
    });
  }

  // ===== Test/dev affordances =====

  async simulateInbound(input: {
    tenantId: string;
    fromNumber: string;
    toNumber?: string;
    operatorId?: string;
  }): Promise<string> {
    const cdrUniqueId = `mock-in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startedAt = new Date().toISOString();
    const evt: AmiCallEvent = {
      cdrUniqueId,
      tenantId: input.tenantId,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber ?? "+998000000000",
      operatorId: input.operatorId,
    };
    await this.fanIn(this.started, { ...evt, direction: "INBOUND", startedAt });
    await this.fanIn(this.incoming, evt);
    await this.fanIn(this.completed, {
      ...evt,
      direction: "INBOUND",
      status: "ANSWERED",
      startedAt,
      duration: 45,
      recordingUrl: `mock://recordings/${cdrUniqueId}.wav`,
    });
    return cdrUniqueId;
  }

  async simulateMissed(input: {
    tenantId: string;
    fromNumber: string;
    toNumber?: string;
    operatorId?: string;
  }): Promise<string> {
    const cdrUniqueId = `mock-miss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startedAt = new Date().toISOString();
    const evt: AmiCallEvent = {
      cdrUniqueId,
      tenantId: input.tenantId,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber ?? "+998000000000",
      operatorId: input.operatorId,
    };
    await this.fanIn(this.started, { ...evt, direction: "INBOUND", startedAt });
    await this.fanIn(this.incoming, evt);
    await this.fanIn(this.completed, {
      ...evt,
      direction: "INBOUND",
      status: "MISSED",
      startedAt,
      duration: 0,
    });
    return cdrUniqueId;
  }

  private async fanIn<T>(handlers: Array<(e: T) => void | Promise<void>>, evt: T): Promise<void> {
    for (const h of handlers) {
      await h(evt);
    }
  }
}
