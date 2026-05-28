import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SOCKET_EVENTS } from "@acoustic-crm/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { QaService } from "../qa/qa.service";
import { WriteTranscriptDto } from "./dto/transcript.dto";

@Injectable()
export class TranscriptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @Optional() @Inject(QaService) private readonly qa?: QaService,
  ) {}

  /**
   * Upserts the transcript for a call. ai-worker may retry on transient
   * errors; one row per call is enforced by the `callId @unique` constraint
   * on Transcript.
   */
  async write(dto: WriteTranscriptDto) {
    // Verify the call exists in the target tenant before writing — guards
    // against worker bugs that point a transcript at the wrong tenant.
    const call = await this.prisma.call.findFirst({
      where: { id: dto.callId, tenantId: dto.tenantId, deletedAt: null },
    });
    if (!call) {
      throw new NotFoundException(`Call ${dto.callId} not found in tenant ${dto.tenantId}`);
    }
    const transcript = await this.prisma.transcript.upsert({
      where: { callId: dto.callId },
      create: {
        callId: dto.callId,
        text: dto.text,
        segments: dto.segments as unknown as Prisma.InputJsonValue,
        language: dto.language ?? "uz",
        confidence: dto.confidence ?? 0,
      },
      update: {
        text: dto.text,
        segments: dto.segments as unknown as Prisma.InputJsonValue,
        language: dto.language ?? "uz",
        confidence: dto.confidence ?? 0,
      },
    });
    this.realtime.toTenant(dto.tenantId, SOCKET_EVENTS.TRANSCRIPT_READY, {
      callId: dto.callId,
      transcriptId: transcript.id,
    });
    // Hand the call off to ai-worker's analysis queue (M8).
    if (this.qa) {
      await this.qa.enqueueAnalysis({ tenantId: dto.tenantId, callId: dto.callId });
    }
    return transcript;
  }
}
