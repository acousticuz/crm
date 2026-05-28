import type {
  AmiCallCompleted,
  AmiCallEvent,
  AmiClient,
  AmiOriginateRequest,
} from "./ami-client";

type IncomingHandler = (e: AmiCallEvent) => void | Promise<void>;
type CompletedHandler = (e: AmiCallCompleted) => void | Promise<void>;

/**
 * Deterministic in-process AMI mock. Exposes `simulateInbound` /
 * `simulateOutbound` / `simulateMissed` so tests and the dev REPL can drive
 * the worker without a real PBX. `originate` immediately completes a
 * synthetic outbound call so the operator sees the full lifecycle.
 */
export class MockAmiClient implements AmiClient {
  readonly name = "mock";
  private incoming: IncomingHandler[] = [];
  private completed: CompletedHandler[] = [];

  async connect(): Promise<void> {
    /* no-op */
  }

  async disconnect(): Promise<void> {
    /* no-op */
  }

  onIncoming(h: IncomingHandler): void {
    this.incoming.push(h);
  }

  onCompleted(h: CompletedHandler): void {
    this.completed.push(h);
  }

  async originate(req: AmiOriginateRequest): Promise<void> {
    // Simulate the dial + completion lifecycle. Real Asterisk would emit
    // Dial → Bridge → Hangup events; we collapse that into the same callbacks
    // for tests.
    const startedAt = new Date().toISOString();
    await this.fanIn(this.incoming, {
      cdrUniqueId: req.cdrUniqueId,
      tenantId: req.tenantId,
      fromNumber: req.fromExtension,
      toNumber: req.toNumber,
      operatorId: req.operatorId,
    });
    // Pretend the call lasted 30 seconds and was answered.
    await this.fanIn(this.completed, {
      cdrUniqueId: req.cdrUniqueId,
      tenantId: req.tenantId,
      fromNumber: req.fromExtension,
      toNumber: req.toNumber,
      operatorId: req.operatorId,
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
    const evt: AmiCallEvent = {
      cdrUniqueId,
      tenantId: input.tenantId,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber ?? "+998000000000",
      operatorId: input.operatorId,
    };
    await this.fanIn(this.incoming, evt);
    await this.fanIn(this.completed, {
      ...evt,
      direction: "INBOUND",
      status: "MISSED",
      startedAt: new Date().toISOString(),
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
