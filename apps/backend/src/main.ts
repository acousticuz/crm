import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
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

  // Swagger / OpenAPI — mounted at /api/docs. Disabled in production unless
  // SWAGGER_ENABLED=1 is set, so we don't leak schema details by default.
  const swaggerEnabled =
    config.get<string>("NODE_ENV") !== "production" ||
    config.get<string>("SWAGGER_ENABLED") === "1";
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Acoustic CRM API")
      .setDescription(
        "AI Call-Center CRM for Uzbek call centers. Multi-tenant, JWT-auth, " +
          "AmoCRM-style Kanban, FreePBX telephony, STT + LLM QA scoring.",
      )
      .setVersion("0.1.0")
      .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "JWT")
      .build();
    const doc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, doc);
    Logger.log("Swagger UI mounted at /api/docs", "Bootstrap");
  }

  const port = config.get<number>("BACKEND_PORT", 3001);
  await app.listen(port);
  Logger.log(`Acoustic CRM backend listening on http://localhost:${port}`, "Bootstrap");
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error", err);
  process.exit(1);
});
