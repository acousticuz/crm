import { Module } from "@nestjs/common";
import { CallsService } from "./calls.service";
import { CallsController } from "./calls.controller";
import { WorkerGuard } from "./worker.guard";

@Module({
  controllers: [CallsController],
  providers: [CallsService, WorkerGuard],
  exports: [CallsService],
})
export class CallsModule {}
