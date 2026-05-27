import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import type { HealthCheckResponse } from "@acoustic-crm/shared";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthCheckResponse> {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? "ok" : "degraded",
      service: "acoustic-crm-backend",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
