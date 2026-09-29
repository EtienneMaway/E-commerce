import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import {
  InventoryEntry,
  MiniSettlement,
  ProductGroup,
  ProductVariant,
  SaleTransaction,
} from '../entities';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { CustodyModule } from '../custody/custody.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SaleTransaction,
      InventoryEntry,
      ProductGroup,
      ProductVariant,
      MiniSettlement,
    ]),
    StockMovementsModule,
    CustodyModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
