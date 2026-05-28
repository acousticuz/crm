import test from "node:test";
import assert from "node:assert/strict";
import type { AmiClient, AmiOriginateRequest } from "./ami/ami-client";
import type { ConfigSource, FreePbxConfig } from "./freepbx-config";
import { TenantAmiManager } from "./tenant-ami-manager";
import { MockAmiClient } from "./ami/mock.ami";

const silent = { log: () => {}, error: () => {} };

class FakeAmi implements AmiClient {
  readonly name = "fake";
  connected = false;
  constructor(public readonly cfg: FreePbxConfig) {}
  async connect(): Promise<void> {
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  async originate(_req: AmiOriginateRequest): Promise<void> {}
  async listExtensions(): Promise<string[]> {
    return [];
  }
  onStarted(): void {}
  onIncoming(): void {}
  onCompleted(): void {}
}

class MutableSource implements ConfigSource {
  constructor(public configs: FreePbxConfig[]) {}
  async fetch(): Promise<FreePbxConfig[]> {
    return this.configs;
  }
}

function cfg(tenantId: string, secret: string, fingerprint: string): FreePbxConfig {
  return { tenantId, host: "10.0.0.1", port: 5038, username: "u", secret, fingerprint };
}

test("connects one client per tenant from the config source", async () => {
  const source = new MutableSource([cfg("t1", "s1", "fp1")]);
  const mgr = new TenantAmiManager(source, (c) => new FakeAmi(c), () => {}, silent);
  await mgr.sync();
  assert.equal(mgr.tenantCount(), 1);
  const client = mgr.getClient("t1") as FakeAmi;
  assert.equal(client.cfg.secret, "s1");
  assert.equal(client.connected, true);
});

test("reconnects with new credentials when the integration changes", async () => {
  const source = new MutableSource([cfg("t1", "s1", "fp1")]);
  const mgr = new TenantAmiManager(source, (c) => new FakeAmi(c), () => {}, silent);
  await mgr.sync();
  const first = mgr.getClient("t1") as FakeAmi;
  assert.equal(first.cfg.secret, "s1");

  // Admin edits the FreePBX integration → new fingerprint + new secret.
  source.configs = [cfg("t1", "s2", "fp2")];
  await mgr.sync();
  const second = mgr.getClient("t1") as FakeAmi;

  assert.equal(first.connected, false, "old client disconnected");
  assert.equal(second.cfg.secret, "s2", "new credentials are in use");
  assert.equal(second.connected, true);
  assert.notEqual(first, second);
});

test("unchanged fingerprint keeps the same connection (no churn)", async () => {
  const source = new MutableSource([cfg("t1", "s1", "fp1")]);
  const mgr = new TenantAmiManager(source, (c) => new FakeAmi(c), () => {}, silent);
  await mgr.sync();
  const first = mgr.getClient("t1");
  await mgr.sync();
  assert.equal(mgr.getClient("t1"), first);
});

test("drops a tenant whose integration was removed", async () => {
  const source = new MutableSource([cfg("t1", "s1", "fp1")]);
  const mgr = new TenantAmiManager(source, (c) => new FakeAmi(c), () => {}, silent);
  await mgr.sync();
  const client = mgr.getClient("t1") as FakeAmi;
  source.configs = [];
  await mgr.sync();
  assert.equal(mgr.tenantCount(), 0);
  assert.equal(client.connected, false);
});

test("MockAmiClient lists extensions for dev/click-to-call assignment", async () => {
  const ami = new MockAmiClient();
  const exts = await ami.listExtensions();
  assert.ok(Array.isArray(exts));
  assert.ok(exts.includes("2000"));
});
