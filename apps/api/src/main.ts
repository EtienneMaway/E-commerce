import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { winstonConfig } from './common/logger/winston.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];

  app.enableCors({
    origin: (origin: string, callback: (arg0: Error | null, arg1: boolean) => any) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow local network / Expo patterns in development
      if (process.env.NODE_ENV !== 'production') {
        const devPatterns = [
          /^exp:\/\//,
          /^http:\/\/192\.168\./,
          /^http:\/\/10\./,
          /^http:\/\/localhost/,
        ];

        if (devPatterns.some((regex) => regex.test(origin))) {
          return callback(null, true);
        }
      }

      // Fallback: if no CORS_ORIGINS configured at all, warn and allow
      // (prevents total lockout from misconfiguration)
      if (allowedOrigins.length === 0) {
        console.warn(`CORS: No CORS_ORIGINS configured — allowing origin "${origin}". Set CORS_ORIGINS in production.`);
        return callback(null, true);
      }

      return callback(new Error(`Not allowed by CORS: ${origin}`), false);
    },

    credentials: true,
  });

  // Global exception filters (applied in reverse: AllExceptions catches first, then HttpException)
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  // Global validation pipe — strips unknown fields, transforms types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Trading App API')
    .setDescription(
      'REST API for the Inventory & Credit Trading App. ' +
      'Manage personal inventory, supplier credit, consignment, sales, and debt tracking.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'jwt',
    )
    .addTag('auth', 'Authentication — register, login, profile')
    .addTag('users', 'User search')
    .addTag('inventory', 'Inventory management — personal, supplier, consigned')
    .addTag('sales', 'Sales recording and history')
    .addTag('payments', 'Payment tracking — to suppliers, from debtors')
    .addTag('dashboard', 'Financial summaries, supplier & debtor views')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on http://0.0.0.0:${port}/api`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
