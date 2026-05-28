import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import { ClsService } from "nestjs-cls";
import { SOCKET_EVENTS } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { AI_ANALYSIS_QUEUE, QA_QUEUE } from "../queue/queue.module";
import { CreateScriptDto, UpdateScriptDto } from "./dto/script.dto";
import {
  QaOverrideDto,
  WriteAnalysisDto,
  WriteQAScoreDto,
} from "./dto/internal.dto";

interface TranscriptForLlm {
  text: string;
  segments: unknown;
  language: string;
}

export interface AiAnalysisJobPayload {
  tenantId: string;
  callId: string;
  transcript?: TranscriptForLlm;
}

export interface QaJobPayload {
  tenantId: string;
  callId: string;
  scriptId: string;
  transcript?: TranscriptForLlm;
  criteria?: unknown[];
}

@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly realtime: RealtimeService,
    @Optional() @Inject(AI_ANALYSIS_QUEUE) private readonly analysisQueue?: Pick<Queue, "add">,
    @Optional() @Inject(QA_QUEUE) private readonly qaQueue?: Pick<Queue, "add">,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  // ===== Scripts CRUD =====

  async createScript(dto: CreateScriptDto) {
    const tenantId = this.currentTenantId();
    try {
      return await this.prisma.t.script.create({
        data: {
          tenantId,
          name: dto.name,
          sections: dto.sections as unknown as Prisma.InputJsonValue,
          criteria: dto.criteria as unknown as Prisma.InputJsonValue,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new ConflictException(`Script "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  listScripts() {
    return this.prisma.t.script.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async findScript(id: string) {
    const s = await this.prisma.t.script.findFirst({
      where: { id, deletedAt: null },
    });
    if (!s) throw new NotFoundException("Script not found");
    return s;
  }

  async updateScript(id: string, dto: UpdateScriptDto) {
    await this.findScript(id);
    return this.prisma.t.script.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sections !== undefined
          ? { sections: dto.sections as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.criteria !== undefined
          ? { criteria: dto.criteria as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deleteScript(id: string): Promise<{ id: string }> {
    await this.findScript(id);
    await this.prisma.t.script.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  // ===== Internal worker writes =====

  async writeAnalysis(dto: WriteAnalysisDto) {
    const call = await this.prisma.call.findFirst({
      where: { id: dto.callId, tenantId: dto.tenantId, deletedAt: null },
    });
    if (!call) throw new NotFoundException("Call not found for this tenant");
    const analysis = await this.prisma.analysis.upsert({
      where: { callId: dto.callId },
      create: {
        callId: dto.callId,
        sentiment: dto.sentiment ?? null,
        topic: dto.topic ?? null,
        summary: dto.summary ?? null,
        nextStep: dto.nextStep ?? null,
        keyPoints: (dto.keyPoints ?? []) as unknown as Prisma.InputJsonValue,
        scriptId: dto.scriptId ?? null,
      },
      update: {
        sentiment: dto.sentiment ?? null,
        topic: dto.topic ?? null,
        summary: dto.summary ?? null,
        nextStep: dto.nextStep ?? null,
        keyPoints: (dto.keyPoints ?? []) as unknown as Prisma.InputJsonValue,
        scriptId: dto.scriptId ?? null,
      },
    });
    // Enqueue QA scoring for every active script — payload carries the
    // transcript + criteria so the worker doesn't need a read endpoint.
    const transcript = await this.prisma.transcript.findFirst({
      where: { callId: dto.callId },
      select: { text: true, segments: true, language: true },
    });
    const scripts = await this.prisma.script.findMany({
      where: { tenantId: dto.tenantId, isActive: true, deletedAt: null },
      select: { id: true, criteria: true },
    });
    if (this.qaQueue && transcript) {
      for (const s of scripts) {
        try {
          await this.qaQueue.add(
            "qa",
            {
              tenantId: dto.tenantId,
              callId: dto.callId,
              scriptId: s.id,
              transcript,
              criteria: Array.isArray(s.criteria) ? (s.criteria as unknown[]) : [],
            } satisfies QaJobPayload,
            { attempts: 3, removeOnComplete: 100, removeOnFail: 50 },
          );
        } catch (err) {
          this.logger.warn(
            `Enqueue qa job failed for call=${dto.callId} script=${s.id}: ${(err as Error).message}`,
          );
        }
      }
    }
    return analysis;
  }

  async writeQAScore(dto: WriteQAScoreDto) {
    const call = await this.prisma.call.findFirst({
      where: { id: dto.callId, tenantId: dto.tenantId, deletedAt: null },
    });
    if (!call) throw new NotFoundException("Call not found for this tenant");
    const script = await this.prisma.script.findFirst({
      where: { id: dto.scriptId, tenantId: dto.tenantId, deletedAt: null },
    });
    if (!script) throw new NotFoundException("Script not found for this tenant");

    // QAScore has no unique constraint on (callId, scriptId) in the schema, so
    // we look up + update; otherwise we'd insert duplicates on retries.
    const existing = await this.prisma.qAScore.findFirst({
      where: { callId: dto.callId, scriptId: dto.scriptId },
    });
    const data = {
      totalScore: dto.totalScore,
      maxScore: dto.maxScore,
      criteriaResults: dto.criteriaResults as unknown as Prisma.InputJsonValue,
    };
    const row = existing
      ? await this.prisma.qAScore.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.qAScore.create({
          data: {
            callId: dto.callId,
            scriptId: dto.scriptId,
            ...data,
          },
        });
    this.realtime.toTenant(dto.tenantId, SOCKET_EVENTS.QA_READY, {
      callId: dto.callId,
      scriptId: dto.scriptId,
      qaScoreId: row.id,
    });
    return row;
  }

  /**
   * Worker is finished — enqueue analysis as soon as a transcript lands.
   * Called from TranscriptsService.write so we don't have to wire another
   * webhook from the worker.
   */
  async enqueueAnalysis(input: { tenantId: string; callId: string }): Promise<void> {
    if (!this.analysisQueue) return;
    const transcript = await this.prisma.transcript.findFirst({
      where: { callId: input.callId },
      select: { text: true, segments: true, language: true },
    });
    if (!transcript) return;
    try {
      await this.analysisQueue.add(
        "analysis",
        { tenantId: input.tenantId, callId: input.callId, transcript } satisfies AiAnalysisJobPayload,
        {
          attempts: 3,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
    } catch (err) {
      this.logger.warn(`Enqueue ai-analysis failed: ${(err as Error).message}`);
    }
  }

  // ===== Read APIs =====

  async scorecard(callId: string) {
    const call = await this.prisma.t.call.findFirst({
      where: { id: callId, deletedAt: null },
      include: {
        analysis: { include: { script: { select: { id: true, name: true } } } },
        qaScores: {
          include: {
            script: { select: { id: true, name: true } },
            reviewer: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        transcript: true,
      },
    });
    if (!call) throw new NotFoundException("Call not found");
    return call;
  }

  async overrideScore(scoreId: string, dto: QaOverrideDto, reviewerId: string) {
    const score = await this.prisma.t.qAScore.findFirst({
      where: { id: scoreId },
    });
    if (!score) throw new NotFoundException("QA score not found");
    return this.prisma.t.qAScore.update({
      where: { id: scoreId },
      data: {
        supervisorOverride: dto.override as unknown as Prisma.InputJsonValue,
        reviewedBy: reviewerId,
      },
    });
  }
}
