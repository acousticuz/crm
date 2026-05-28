import type {
  AmiCallCompleted,
  AmiCallEvent,
  AmiClient,
  AmiOriginateRequest,
} from "./ami-client";

/**
 * Real Asterisk Manager Interface client skeleton. Production deployment
 * would `npm install asterisk-manager` and implement:
 *
 *   const ami = new (require("asterisk-manager"))(
 *     port, host, username, password, true,
 *   );
 *   ami.on("managerevent", (e) => { ... });
 *   ami.action({ action: "Originate", ... });
 *
 * For M6 we only ship the interface surface — wiring real Asterisk is gated
 * on the customer's PBX being reachable (DECISIONS.md §30). Tests use
 * MockAmiClient end-to-end.
 */
export class AsteriskAmiClient implements AmiClient {
  readonly name = "asterisk";

  constructor(
    private readonly config: {
      host: string;
      port: number;
      username: string;
      password: string;
      tenantId: string;
    },
  ) {
    void this.config;
  }

  async connect(): Promise<void> {
    throw new Error(
      "AsteriskAmiClient is a skeleton — install `asterisk-manager` and wire AMI events here in M11 deploy hardening.",
    );
  }

  async disconnect(): Promise<void> {
    /* no-op */
  }

  async originate(_req: AmiOriginateRequest): Promise<void> {
    throw new Error("AsteriskAmiClient.originate not implemented in M6 skeleton");
  }

  onIncoming(_h: (e: AmiCallEvent) => void | Promise<void>): void {
    /* no-op */
  }

  onCompleted(_h: (e: AmiCallCompleted) => void | Promise<void>): void {
    /* no-op */
  }
}
