import axios, { type AxiosInstance } from "axios";

interface BackendOpts {
  baseUrl: string;
  sharedSecret: string;
}

/**
 * Thin HTTP client that posts AMI-derived events to the backend. All calls
 * go through `/api/v1/internal/calls/*` guarded by the X-Worker-Secret header.
 */
export class BackendClient {
  private readonly http: AxiosInstance;

  constructor(private readonly opts: BackendOpts) {
    this.http = axios.create({
      baseURL: `${opts.baseUrl.replace(/\/$/, "")}/api/v1/internal/calls`,
      headers: { "X-Worker-Secret": opts.sharedSecret },
      timeout: 5000,
    });
  }

  async reportIncoming(body: {
    tenantId: string;
    cdrUniqueId: string;
    fromNumber: string;
    toNumber: string;
    operatorId?: string;
  }): Promise<void> {
    await this.http.post("/incoming", body);
  }

  async reportCompleted(body: {
    tenantId: string;
    cdrUniqueId: string;
    direction: "INBOUND" | "OUTBOUND";
    fromNumber: string;
    toNumber: string;
    operatorId?: string;
    status: "ANSWERED" | "MISSED" | "BUSY" | "FAILED";
    startedAt: string;
    duration: number;
    recordingUrl?: string;
  }): Promise<void> {
    await this.http.post("/completed", body);
  }
}
