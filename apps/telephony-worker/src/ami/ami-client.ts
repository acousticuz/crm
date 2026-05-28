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

  /** Hook a listener for inbound Newchannel/Dial events. */
  onIncoming(handler: (evt: AmiCallEvent) => void | Promise<void>): void;

  /** Hook a listener for Hangup events with derived status + duration. */
  onCompleted(handler: (evt: AmiCallCompleted) => void | Promise<void>): void;
}
