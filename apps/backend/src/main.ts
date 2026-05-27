import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { API_PREFIX } from "@acoustic-crm/shared";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  app.setGlobalPrefix(API_PREFIX, { exclude: ["health"] });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: config.get<string>("CORS_ORIGIN", "*"),
    credentials: true,
  });

  const port = config.get<number>("BACKEND_PORT", 3001);
  await app.listen(port);
  Logger.log(`Acoustic CRM backend listening on http://localhost:${port}`, "Bootstrap");
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal bootstrap error", err);
  process.exit(1);
});
