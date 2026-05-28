import { Module } from "@nestjs/common";
import { QaService } from "./qa.service";
import { QaController } from "./qa.controller";
import { WorkerGuard } from "../calls/worker.guard";

@Module({
  controllers: [QaController],
  providers: [QaService, WorkerGuard],
  exports: [QaService],
})
export class QaModule {}
