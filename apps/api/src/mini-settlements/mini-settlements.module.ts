import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DebtorCredit,
  Employment,
  InventoryEntry,
  MiniExpense,
  MiniSettlement,
  MiniSettlementItem,
  Payment,
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
    ]),
    StockMovementsModule,
    CurrencyModule,
  ],
  controllers: [MiniSettlementsController],
  providers: [MiniSettlementsService],
  exports: [MiniSettlementsService],
})
export class MiniSettlementsModule {}
