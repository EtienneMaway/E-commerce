import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ConsignmentRequest,
  MiniSettlement,
  CustodyHandover,
  CustodyHandoverAdjustment,
  CustodyHandoverItem,
  CustodyTeamMember,
  Employment,
  Expense,
  InventoryEntry,
  SaleTransaction,
  StockCustody,
  StockIssue,
  StockIssueItem,
} from '../entities';
import { CustodyService } from './custody.service';
import { CustodyController } from './custody.controller';
import { CustodyHandoversService } from './custody-handovers.service';
import { CustodyHandoversController } from './custody-handovers.controller';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockCustody,
      StockIssue,
      StockIssueItem,
      CustodyTeamMember,
      CustodyHandover,
      CustodyHandoverItem,
      CustodyHandoverAdjustment,
      InventoryEntry,
      SaleTransaction,
      Expense,
      Employment,
      ConsignmentRequest,
      MiniSettlement,
    ]),
    StockMovementsModule,
    CurrencyModule,
  ],
  // Order matters. `CustodyHandoversController` owns the literal `handovers`
  // segment and is registered first so `CustodyController`'s `:id` patterns
  // cannot swallow it — the same hazard that made `/custody/mine/issues` match
  // `/custody/:id/issues` with id="mine" before the routes were reordered.
  controllers: [CustodyHandoversController, CustodyController],
  providers: [CustodyService, CustodyHandoversService],
  // SalesModule asks us which volumes an actor may deduct from, and how a new
  // sale should be stamped. The dependency points one way only — nothing here
  // imports SalesModule.
  exports: [CustodyService, CustodyHandoversService],
})
export class CustodyModule {}
