import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ConsignmentRequest,
  DebtorCredit,
  Employment,
  InventoryEntry,
  MiniExpense,
  MiniSettlement,
  MiniSettlementItem,
  MiniTeamMember,
  Payment,
  ProductVariant,
  SaleTransaction,
  SupplierDebt,
} from '../entities';
import { MiniSettlementsService } from './mini-settlements.service';
import { MiniSettlementsController } from './mini-settlements.controller';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MiniSettlement,
      MiniSettlementItem,
      InventoryEntry,
      DebtorCredit,
      SupplierDebt,
      Payment,
      SaleTransaction,
      Employment,
      MiniExpense,
      MiniTeamMember,
      ProductVariant,
      ConsignmentRequest,
    ]),
    StockMovementsModule,
    CurrencyModule,
  ],
  controllers: [MiniSettlementsController],
  providers: [MiniSettlementsService],
  exports: [MiniSettlementsService],
})
export class MiniSettlementsModule {}
