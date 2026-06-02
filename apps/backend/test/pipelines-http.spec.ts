import "reflect-metadata";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule } from "nestjs-cls";
import { API_PREFIX, UserRole } from "@acoustic-crm/shared";
import { PrismaModule } from "../src/modules/prisma/prisma.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeModule } from "../src/modules/realtime/realtime.module";
import { AuditModule } from "../src/modules/audit/audit.module";
import { PipelinesModule } from "../src/modules/pipelines/pipelines.module";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { writeContext } from "../src/common/tenant-context";

/**
 * Real HTTP-layer test for pipelines/stages. Exists because backend unit tests
 * call services directly and bypass the ValidationPipe — that's how the
 * "adding a Kanban stage does nothing" bug slipped through: the frontend was
 * posting path params inside the body, and `forbidNonWhitelisted: true`
 * rejected them with 400 only at the HTTP boundary.
 *
 * Each request seeds tenant context via an X-Test-Tenant-Id header so the
 * Prisma tenant extension applies the right scope, mirroring what
 * JwtStrategy.validate does in production.
 */
describe("HTTP — Pipelines / Stages (validation + frontend payload contract)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantId: string;
  let userId: string;
  let pipelineId: string;

  const runId = `pl-http-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({
          global: true,
          middleware: {
            mount: true,
            setup: (cls, req) => {
              const r = req as { headers: Record<string, string | string[] | undefined> };
              const tid = r.headers["x-test-tenant-id"];
              const uid = r.headers["x-test-user-id"];
              if (typeof tid === "string") {
                writeContext(cls, {
                  tenantId: tid,
                  userId: typeof uid === "string" ? uid : null,
                  role: UserRole.TENANT_ADMIN,
                  email: "test@test.local",
                  skipTenantFilter: false,
                });
              }
            },
          },
        }),
        EventEmitterModule.forRoot({ wildcard: true }),
        PrismaModule,
        AuditModule,
        RealtimeModule,
        PipelinesModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror production main.ts so the test catches whitelist/transform bugs.
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.setGlobalPrefix(API_PREFIX, { exclude: ["health"] });
    await app.init();

    prisma = moduleRef.get(PrismaService);

    const tenant = await prisma.tenant.create({
      data: { name: `${runId}-tenant`, status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName: "HTTP Admin",
        email: `${runId}-admin@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    userId = user.id;
    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "HTTP Default", isDefault: true, order: 0 },
    });
    pipelineId = pipeline.id;
    // Seed at least one stage so updateStage/reorder have something to operate on.
    await prisma.stage.create({
      data: { tenantId, pipelineId, name: "Yangi", order: 0, color: "#0ea5e9", type: "NORMAL" },
    });
  });

  afterAll(async () => {
    await prisma.stage.deleteMany({ where: { tenantId } });
    await prisma.pipeline.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
    await moduleRef.close();
  });

  function asAdmin(req: request.Test): request.Test {
    return req.set("X-Test-Tenant-Id", tenantId).set("X-Test-User-Id", userId);
  }

  it("POST /pipelines/:id/stages with the exact frontend payload returns 201", async () => {
    // This is the payload the FIXED usePipelineAdmin.createStage now sends —
    // pipelineId is in the URL only, not the body.
    const res = await asAdmin(
      request(app.getHttpServer())
        .post(`${API_PREFIX}/pipelines/${pipelineId}/stages`)
        .send({ name: "Bog'lanildi", order: 1, type: "NORMAL" }),
    );
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Bog'lanildi");
    expect(res.body.pipelineId).toBe(pipelineId);
  });

  it("POST /pipelines/:id/stages with pipelineId IN THE BODY returns 400 (regression guard)", async () => {
    // The original bug: usePipelineAdmin was posting `{ pipelineId, name, ... }`.
    // ValidationPipe(forbidNonWhitelisted) catches this — this test documents
    // the contract so nobody re-introduces the bug.
    const res = await asAdmin(
      request(app.getHttpServer())
        .post(`${API_PREFIX}/pipelines/${pipelineId}/stages`)
        .send({ pipelineId, name: "Should 400", order: 2, type: "NORMAL" }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/pipelineId/);
  });

  it("PATCH /pipelines/:id/stages/:stageId with the frontend payload returns 200", async () => {
    const created = await asAdmin(
      request(app.getHttpServer())
        .post(`${API_PREFIX}/pipelines/${pipelineId}/stages`)
        .send({ name: "Patch me", order: 3, type: "NORMAL" }),
    );
    const stageId = created.body.id as string;

    const res = await asAdmin(
      request(app.getHttpServer())
        .patch(`${API_PREFIX}/pipelines/${pipelineId}/stages/${stageId}`)
        .send({ name: "Patched" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Patched");
  });

  it("POST /pipelines/:id/stages/reorder with { stageIds } returns 200", async () => {
    const list = await asAdmin(
      request(app.getHttpServer()).get(`${API_PREFIX}/pipelines/${pipelineId}/stages`),
    );
    const ids = (list.body as Array<{ id: string }>).map((s) => s.id).reverse();
    const res = await asAdmin(
      request(app.getHttpServer())
        .post(`${API_PREFIX}/pipelines/${pipelineId}/stages/reorder`)
        .send({ stageIds: ids }),
    );
    expect(res.status).toBe(200);
  });
});
