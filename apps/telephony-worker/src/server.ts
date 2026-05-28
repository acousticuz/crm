import express from "express";
import type { Request, Response } from "express";
import type { AmiClient } from "./ami/ami-client";

interface ServerOpts {
  port: number;
  sharedSecret: string;
  /** Resolve the AMI client for a tenant (undefined if none connected). */
  resolveClient: (tenantId: string) => AmiClient | undefined;
  /** Describe the current connection state for the health endpoint/logs. */
  describe: () => { mode: string; tenants: number };
}

/**
 * Tiny HTTP server the backend hits to request outbound originates. Auth is a
 * shared secret in the X-Worker-Secret header (symmetric with the backend's
 * worker guard).
 */
export function startWorkerServer(opts: ServerOpts): () => void {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/worker/health", (_req: Request, res: Response) => {
    const state = opts.describe();
    res.json({
      status: "ok",
      mode: state.mode,
      tenants: state.tenants,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.get("/worker/extensions", async (req: Request, res: Response) => {
    const secret = req.header("x-worker-secret");
    if (!secret || secret !== opts.sharedSecret) {
      res.status(401).json({ error: "Invalid worker credentials" });
      return;
    }
    const tenantId = String(req.query.tenantId ?? "");
    if (!tenantId) {
      res.status(400).json({ error: "tenantId required" });
      return;
    }
    const client = opts.resolveClient(tenantId);
    if (!client) {
      res.status(503).json({ error: "No AMI connection for this tenant" });
      return;
    }
    try {
      const extensions = await client.listExtensions();
      res.json({ extensions });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/worker/originate", async (req: Request, res: Response) => {
    const secret = req.header("x-worker-secret");
    if (!secret || secret !== opts.sharedSecret) {
      res.status(401).json({ error: "Invalid worker credentials" });
      return;
    }
    const body = req.body as {
      tenantId?: string;
      cdrUniqueId?: string;
      operatorId?: string;
      fromExtension?: string;
      toNumber?: string;
      cardId?: string;
    };
    if (!body.tenantId || !body.cdrUniqueId || !body.operatorId || !body.fromExtension || !body.toNumber) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const client = opts.resolveClient(body.tenantId);
    if (!client) {
      res.status(503).json({ error: "No AMI connection for this tenant" });
      return;
    }
    try {
      await client.originate({
        tenantId: body.tenantId,
        cdrUniqueId: body.cdrUniqueId,
        operatorId: body.operatorId,
        fromExtension: body.fromExtension,
        toNumber: body.toNumber,
        cardId: body.cardId,
      });
      res.status(202).json({ queued: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  const server = app.listen(opts.port, () => {
    const state = opts.describe();
    console.log(
      `telephony-worker listening on :${opts.port} (mode=${state.mode}, tenants=${state.tenants})`,
    );
  });

  return () => server.close();
}
