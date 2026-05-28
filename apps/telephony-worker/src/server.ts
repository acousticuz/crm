import express from "express";
import type { Request, Response } from "express";
import type { AmiClient } from "./ami/ami-client";

interface ServerOpts {
  port: number;
  sharedSecret: string;
  ami: AmiClient;
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
    res.json({ status: "ok", ami: opts.ami.name, uptimeSeconds: Math.floor(process.uptime()) });
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
    try {
      await opts.ami.originate({
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
    console.log(`telephony-worker listening on :${opts.port} (ami=${opts.ami.name})`);
  });

  return () => server.close();
}
