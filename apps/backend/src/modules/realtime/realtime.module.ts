import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { RealtimeService } from "./realtime.service";
import { AppGateway } from "./app.gateway";

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_ACCESS_SECRET", "change-me-access-secret"),
      }),
    }),
  ],
  providers: [RealtimeService, AppGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
