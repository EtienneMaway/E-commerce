import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import {
  ConsignmentRequest,
  DebtorCredit,
  InventoryEntry,
  Payment,
  SaleTransaction,
  SupplierDebt,
} from '../entities';
import { ConsignmentsModule } from '../consignments/consignments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplierDebt,
      DebtorCredit,
      SaleTransaction,
      InventoryEntry,
      Payment,
      ConsignmentRequest,
    ]),
    ConsignmentsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
