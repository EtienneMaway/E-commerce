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
  ExchangeRate,
  ExternalContact,
  ExternalTransaction,
  StockMovement,
  Expense,
  Withdrawal,
} from './entities';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ConsignmentsModule } from './consignments/consignments.module';
import { CurrencyModule } from './currency/currency.module';
import { ExternalContactsModule } from './external-contacts/external-contacts.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { ExpensesModule } from './expenses/expenses.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';

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
          ExchangeRate,
          ExternalContact,
          ExternalTransaction,
          StockMovement,
          Expense,
          Withdrawal,
        ],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        migrations: [__dirname + '/database/migrations/*.{ts,js}'],
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
    CurrencyModule,
    ExternalContactsModule,
    StockMovementsModule,
    ExpensesModule,
    WithdrawalsModule,
  ],
  providers: [
    // Apply throttle guard globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
