import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import {
  ConsignmentRequest,
  DebtorCredit,
  Expense,
  ExternalContact,
  ExternalTransaction,
  InventoryEntry,
  Payment,
  SaleTransaction,
  SupplierDebt,
  Withdrawal,
} from '../entities';
import { ConsignmentsModule } from '../consignments/consignments.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplierDebt,
      DebtorCredit,
      SaleTransaction,
      InventoryEntry,
      Payment,
      ConsignmentRequest,
      ExternalContact,
      ExternalTransaction,
      Expense,
      Withdrawal,
    ]),
    ConsignmentsModule,
    CurrencyModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
