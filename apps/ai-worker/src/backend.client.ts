import axios, { type AxiosInstance } from "axios";
import type { TranscriptSegment } from "@acoustic-crm/shared";
import type { BackendApiForAi } from "./aiJobs";

/**
 * HTTP client for backend's `/api/v1/internal/*` endpoints. Authenticated
 * with the same X-Worker-Secret used by telephony-worker.
 */
export class BackendClient implements BackendApiForAi {
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

  async writeAnalysis(body: Parameters<BackendApiForAi["writeAnalysis"]>[0]): Promise<void> {
    await this.http.post("/analyses", body);
  }

  async writeQAScore(body: Parameters<BackendApiForAi["writeQAScore"]>[0]): Promise<void> {
    await this.http.post("/qa-scores", body);
  }
}
