/**
 * A tenant's FreePBX/AMI credentials as resolved from the backend's saved
 * Integration row (or the env fallback). The `fingerprint` changes whenever an
 * admin edits the credentials, which is how the manager detects that it must
 * reconnect.
 */
export interface FreePbxConfig {
  tenantId: string;
  host: string;
  port: number;
  username: string;
  secret: string;
  fingerprint: string;
}

/** Anything that can produce the current set of per-tenant FreePBX configs. */
export interface ConfigSource {
  fetch(): Promise<FreePbxConfig[]>;
}

interface BackendConfigSourceOpts {
  baseUrl: string;
  sharedSecret: string;
  /** Used only when the backend returns no configs / is unreachable. */
  envFallback?: FreePbxConfig | null;
}

/**
 * Pulls per-tenant FreePBX configs from the backend's worker-only endpoint.
 * The backend (Settings) is the source of truth; the env fallback exists so a
 * single-tenant dev/legacy setup keeps working when nothing is configured in
 * the UI yet.
 */
export class BackendConfigSource implements ConfigSource {
  constructor(private readonly opts: BackendConfigSourceOpts) {}

  async fetch(): Promise<FreePbxConfig[]> {
    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/api/v1/internal/telephony/freepbx`;
    try {
      const res = await fetch(url, {
        headers: { "X-Worker-Secret": this.opts.sharedSecret },
      });
      if (res.ok) {
        const data = (await res.json()) as FreePbxConfig[];
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      // Network/JSON error — fall through to the env fallback below.
    }
    return this.opts.envFallback ? [this.opts.envFallback] : [];
  }
}
