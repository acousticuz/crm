import type { AmiClient } from "./ami/ami-client";
import type { BackendClient } from "./backend.client";

/**
 * Glues AMI events to backend reports. The coordinator owns no state — every
 * call is identified end-to-end by its cdrUniqueId.
 */
export class Coordinator {
  constructor(
    private readonly ami: AmiClient,
    private readonly backend: BackendClient,
  ) {}

  attach(): void {
    this.ami.onIncoming(async (evt) => {
      try {
        await this.backend.reportIncoming({
          tenantId: evt.tenantId,
          cdrUniqueId: evt.cdrUniqueId,
          fromNumber: evt.fromNumber,
          toNumber: evt.toNumber,
          operatorId: evt.operatorId,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`reportIncoming failed: ${(err as Error).message}`);
      }
    });

    this.ami.onCompleted(async (evt) => {
      try {
        await this.backend.reportCompleted({
          tenantId: evt.tenantId,
          cdrUniqueId: evt.cdrUniqueId,
          direction: evt.direction,
          fromNumber: evt.fromNumber,
          toNumber: evt.toNumber,
          operatorId: evt.operatorId,
          status: evt.status,
          startedAt: evt.startedAt,
          duration: evt.duration,
          recordingUrl: evt.recordingUrl,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`reportCompleted failed: ${(err as Error).message}`);
      }
    });
  }
}
