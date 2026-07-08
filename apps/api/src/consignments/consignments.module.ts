import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ConsignmentRequest,
  ConsignmentItem,
  User,
  InventoryEntry,
  DebtorCredit,
  ProductGroup,
  ProductVariant,
} from '../entities';
import { ConsignmentsService } from './consignments.service';
import { ConsignmentsController } from './consignments.controller';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConsignmentRequest,
      ConsignmentItem,
      User,
      InventoryEntry,
      DebtorCredit,
      ProductGroup,
      ProductVariant,
    ]),
    StockMovementsModule,
    CurrencyModule,
  ],
  controllers: [ConsignmentsController],
  providers: [ConsignmentsService],
  exports: [ConsignmentsService],
})
export class ConsignmentsModule {}
