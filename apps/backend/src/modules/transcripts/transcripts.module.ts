import { Module } from "@nestjs/common";
import { TranscriptsService } from "./transcripts.service";
import { TranscriptsController } from "./transcripts.controller";
import { WorkerGuard } from "../calls/worker.guard";

@Module({
  controllers: [TranscriptsController],
  providers: [TranscriptsService, WorkerGuard],
  exports: [TranscriptsService],
})
export class TranscriptsModule {}
