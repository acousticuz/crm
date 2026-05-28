import axios, { type AxiosInstance } from "axios";
import type { TranscriptSegment } from "@acoustic-crm/shared";

/**
 * Posts transcripts to the backend's internal endpoint. Same shared-secret
 * scheme as telephony-worker (X-Worker-Secret = TELEPHONY_WORKER_SECRET).
 */
export class BackendClient {
  private readonly http: AxiosInstance;

  constructor(opts: { baseUrl: string; sharedSecret: string }) {
    this.http = axios.create({
      baseURL: `${opts.baseUrl.replace(/\/$/, "")}/api/v1/internal`,
      headers: { "X-Worker-Secret": opts.sharedSecret },
      timeout: 15_000,
    });
  }

  async writeTranscript(body: {
    tenantId: string;
    callId: string;
    text: string;
    segments: TranscriptSegment[];
    language: string;
    confidence: number;
  }): Promise<void> {
    await this.http.post("/transcripts", body);
  }
}
