import { Module } from "@nestjs/common";
import { AcousticSyncController } from "./acoustic-sync.controller";
import { AcousticSyncService } from "./acoustic-sync.service";

@Module({
  controllers: [AcousticSyncController],
  providers: [AcousticSyncService],
  exports: [AcousticSyncService],
})
export class AcousticSyncModule {}
