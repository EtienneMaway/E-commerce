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

  // Enable CORS for dashboard and mobile dev
  app.enableCors({
    origin: [
      'http://localhost:3001', // Next.js dashboard
      'http://localhost:8081', // Expo dev server
      'https://e-commerce-dasboard-rbsysmbzs-etienne-maways-projects.vercel.app',
      /^exp:\/\//,             // Expo Go
      /^http:\/\/192\.168\./,  // Android emulator / physical device on LAN
      /^http:\/\/10\./,        // Android emulator via 10.0.2.2
    ],
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
