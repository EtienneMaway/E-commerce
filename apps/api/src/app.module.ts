import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  User,
  InventoryEntry,
  SupplierDebt,
  DebtorCredit,
  Payment,
  SaleTransaction,
  ConsignmentRequest,
  ConsignmentItem,
} from './entities';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ConsignmentsModule } from './consignments/consignments.module';

@Module({
  imports: [
    // Config — loads .env, available globally
    ConfigModule.forRoot({ isGlobal: true }),

    // TypeORM — PostgreSQL
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [
          User,
          InventoryEntry,
          SupplierDebt,
          DebtorCredit,
          Payment,
          SaleTransaction,
          ConsignmentRequest,
          ConsignmentItem,
        ],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),

    // Rate limiting — 100 requests per minute globally; login endpoint is more restricted
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // Feature modules
    AuthModule,
    UsersModule,
    InventoryModule,
    SalesModule,
    PaymentsModule,
    DashboardModule,
    ConsignmentsModule,
  ],
  providers: [
    // Apply throttle guard globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
