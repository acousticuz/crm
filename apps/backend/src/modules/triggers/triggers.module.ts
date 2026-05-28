import { Global, Module } from "@nestjs/common";
import { TriggersService } from "./triggers.service";
import { TriggersController } from "./triggers.controller";
import { TriggerEngine } from "./trigger.engine";

@Global()
@Module({
  controllers: [TriggersController],
  providers: [TriggersService, TriggerEngine],
  exports: [TriggersService, TriggerEngine],
})
export class TriggersModule {}
