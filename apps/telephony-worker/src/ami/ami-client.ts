// AmiClient contract every Asterisk Manager implementation satisfies. Lets
// us plug in a real Asterisk connector for production and a deterministic
// mock for local development / tests / CI without a PBX.

export interface AmiCallEvent {
  /** Asterisk-assigned UniqueID (we map this onto Call.cdrUniqueId). */
  cdrUniqueId: string;
  /** Tenant the line belongs to — derived from extension or trunk mapping. */
  tenantId: string;
  fromNumber: string;
  toNumber: string;
  operatorId?: string;
}

/** Emitted when a channel STARTS (ringing) so the Call row is created early
 * and never lost even if the call is never answered. */
export interface AmiCallStarted extends AmiCallEvent {
  direction: "INBOUND" | "OUTBOUND";
  startedAt: string;
}

export interface AmiCallCompleted extends AmiCallEvent {
  direction: "INBOUND" | "OUTBOUND";
  status: "ANSWERED" | "MISSED" | "BUSY" | "FAILED";
  startedAt: string;
  duration: number;
  recordingUrl?: string;
}

export interface AmiOriginateRequest {
  tenantId: string;
  cdrUniqueId: string;
  operatorId: string;
  fromExtension: string;
  toNumber: string;
  cardId?: string;
}

export interface AmiClient {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Operator → AMI Originate (outbound call). */
  originate(req: AmiOriginateRequest): Promise<void>;

  /** List the PBX's configured PJSIP extension names (e.g. "2000", "2001"). */
  listExtensions(): Promise<string[]>;

  /** Hook a listener for channel-start (ringing) events — creates the Call
   * row eagerly so missed/busy/failed calls are never lost. */
  onStarted(handler: (evt: AmiCallStarted) => void | Promise<void>): void;

  /** Hook a listener for inbound Newchannel events (screen-pop). */
  onIncoming(handler: (evt: AmiCallEvent) => void | Promise<void>): void;

  /** Hook a listener for Hangup events with derived status + duration. */
  onCompleted(handler: (evt: AmiCallCompleted) => void | Promise<void>): void;
}
