import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ClsModule } from "nestjs-cls";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { EskizSmsAdapter } from "../src/modules/sms/adapters/eskiz.adapter";
import { EskizTokenCacheService } from "../src/modules/sms/adapters/eskiz-token-cache.service";

/**
 * Adapter-level Eskiz auth contract:
 *  (1) ensureToken logs in once and reuses the cached JWT on the next call;
 *  (2) a 401 triggers refresh-or-relogin → retry once;
 *  (3) testConnection logs in + calls /auth/user and reports cleanly;
 *  (4) the cache row survives the process — written to eskiz_token_cache,
 *      not held in adapter memory.
 *
 * Eskiz HTTP is mocked via global.fetch so the test never hits the real API.
 */
describe("Eskiz adapter — token auth, cache, refresh, retry", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let adapter: EskizSmsAdapter;
  let cache: EskizTokenCacheService;

  let tenantId: string;
  const runId = `eskiz-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
      ],
      providers: [PrismaService, EskizTokenCacheService, EskizSmsAdapter],
    }).compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    adapter = moduleRef.get(EskizSmsAdapter);
    cache = moduleRef.get(EskizTokenCacheService);
    await prisma.$connect();

    const t = await prisma.tenant.create({
      data: { name: `${runId}-tenant`, status: "ACTIVE" },
    });
    tenantId = t.id;
  });

  afterAll(async () => {
    await prisma.eskizTokenCache.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cache.clear(tenantId);
  });

  function mockFetch(impl: (url: string, init: RequestInit | undefined) => Promise<Response>) {
    return jest
      .spyOn(global, "fetch")
      .mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) =>
        impl(String(url), init),
      );
  }

  const cfg = { email: "test@test.uz", password: "p@ssw0rd" };

  it("first call logs in and caches the token; second call reuses the cache (no second login)", async () => {
    let loginCalls = 0;
    let sendCalls = 0;
    const spy = mockFetch(async (url) => {
      if (url.endsWith("/auth/login")) {
        loginCalls++;
        return new Response(JSON.stringify({ data: { token: "JWT-FRESH" } }), { status: 200 });
      }
      if (url.endsWith("/message/sms/send")) {
        sendCalls++;
        return new Response(JSON.stringify({ id: 1, status: "waiting" }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    try {
      await adapter.send({ phone: "+998901112233", text: "first" }, cfg, { tenantId });
      await adapter.send({ phone: "+998901112233", text: "second" }, cfg, { tenantId });
      expect(loginCalls).toBe(1);
      expect(sendCalls).toBe(2);
      const cached = await cache.read(tenantId);
      expect(cached?.token).toBe("JWT-FRESH");
      expect(cached?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      spy.mockRestore();
    }
  });

  it("a 401 from /message/sms/send triggers /auth/refresh and retries the request once", async () => {
    // Seed cache so the first send uses an existing token.
    await cache.write(tenantId, "JWT-STALE", new Date(Date.now() + 60_000));
    const calls: string[] = [];
    const spy = mockFetch(async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/auth/refresh")) {
        return new Response(JSON.stringify({ data: { token: "JWT-REFRESHED" } }), { status: 200 });
      }
      if (url.endsWith("/message/sms/send")) {
        const bearer = (init?.headers as Record<string, string>)?.Authorization ?? "";
        // First send (stale) → 401. After refresh, the new token is accepted.
        if (bearer === "Bearer JWT-STALE") {
          return new Response(JSON.stringify({ message: "Token expired" }), { status: 401 });
        }
        return new Response(JSON.stringify({ id: 99, status: "waiting" }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    try {
      const res = await adapter.send({ phone: "+998900000001", text: "retry" }, cfg, { tenantId });
      expect(res.status).toBe("SENT");
      expect(res.providerMessageId).toBe("99");
      expect(calls.filter((c) => c.includes("/auth/refresh"))).toHaveLength(1);
      // The retry is the second send call.
      expect(calls.filter((c) => c.includes("/message/sms/send"))).toHaveLength(2);
      const cached = await cache.read(tenantId);
      expect(cached?.token).toBe("JWT-REFRESHED");
    } finally {
      spy.mockRestore();
    }
  });

  it("if /auth/refresh fails, the adapter re-logs in and retries the original request once", async () => {
    await cache.write(tenantId, "JWT-DEAD", new Date(Date.now() + 60_000));
    const calls: string[] = [];
    const spy = mockFetch(async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/auth/refresh")) {
        return new Response(JSON.stringify({ message: "refresh denied" }), { status: 401 });
      }
      if (url.endsWith("/auth/login")) {
        return new Response(JSON.stringify({ data: { token: "JWT-FRESH-AFTER-RELOGIN" } }), { status: 200 });
      }
      if (url.endsWith("/message/sms/send")) {
        const bearer = (init?.headers as Record<string, string>)?.Authorization ?? "";
        if (bearer === "Bearer JWT-DEAD") {
          return new Response(JSON.stringify({ message: "Token expired" }), { status: 401 });
        }
        return new Response(JSON.stringify({ id: 7, status: "waiting" }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    try {
      const res = await adapter.send({ phone: "+998900000002", text: "relogin" }, cfg, { tenantId });
      expect(res.status).toBe("SENT");
      expect(res.providerMessageId).toBe("7");
      expect(calls.filter((c) => c.includes("/auth/refresh"))).toHaveLength(1);
      expect(calls.filter((c) => c.includes("/auth/login"))).toHaveLength(1);
      const cached = await cache.read(tenantId);
      expect(cached?.token).toBe("JWT-FRESH-AFTER-RELOGIN");
    } finally {
      spy.mockRestore();
    }
  });

  it("testConnection performs a real login + /auth/user and reports success cleanly", async () => {
    const spy = mockFetch(async (url) => {
      if (url.endsWith("/auth/login")) {
        return new Response(JSON.stringify({ data: { token: "JWT-TEST" } }), { status: 200 });
      }
      if (url.endsWith("/auth/user")) {
        return new Response(
          JSON.stringify({ data: { email: "test@test.uz", balance: 5000 } }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    try {
      const result = await adapter.testConnection(cfg, { tenantId });
      expect(result.ok).toBe(true);
      expect(result.message).toContain("test@test.uz");
      // Token-expired wording never surfaces here — the adapter handles
      // the token entirely on its own.
      expect(result.message).not.toMatch(/expired/i);
    } finally {
      spy.mockRestore();
    }
  });

  it("testConnection reports a clean failure (no raw token state) when login fails", async () => {
    const spy = mockFetch(async (url) => {
      if (url.endsWith("/auth/login")) {
        return new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 401 });
      }
      return new Response("{}", { status: 200 });
    });
    try {
      const result = await adapter.testConnection(cfg, { tenantId });
      expect(result.ok).toBe(false);
      // No token wording leaks; the message just says auth failed.
      expect(result.message).not.toMatch(/token/i);
    } finally {
      spy.mockRestore();
    }
  });
});
