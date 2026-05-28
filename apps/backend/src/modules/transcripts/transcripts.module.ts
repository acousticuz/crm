import { Module } from "@nestjs/common";
import { TranscriptsService } from "./transcripts.service";
import { TranscriptsController } from "./transcripts.controller";
import { WorkerGuard } from "../calls/worker.guard";
import { QaModule } from "../qa/qa.module";

@Module({
  imports: [QaModule],
  controllers: [TranscriptsController],
  providers: [TranscriptsService, WorkerGuard],
  exports: [TranscriptsService],
})
export class TranscriptsModule {}
