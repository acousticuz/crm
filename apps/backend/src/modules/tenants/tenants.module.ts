import { Module } from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { TenantsController } from "./tenants.controller";
import { PlatformController } from "./platform.controller";

@Module({
  controllers: [TenantsController, PlatformController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
