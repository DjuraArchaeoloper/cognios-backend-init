import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import helmet from "helmet";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const isProduction = process.env.NODE_ENV === "production";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", frontendUrl],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hidePoweredBy: true,
      frameguard: {
        action: "deny",
      },
      noSniff: true,
      xssFilter: true,
      ...(isProduction && {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      }),
    }),
  );

  app.use(cookieParser());

  app.enableCors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Set-Cookie"],
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set("trust proxy", 1);

  const port = process.env.PORT || 4001;
  await app.listen(port, "0.0.0.0");
  console.log(`Backend service is running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
