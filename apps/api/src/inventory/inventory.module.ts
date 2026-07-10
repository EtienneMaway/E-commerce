import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import {
  DebtorCredit,
  InventoryEntry,
  ProductGroup,
  ProductVariant,
  SupplierDebt,
  User,
} from '../entities';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryEntry,
      User,
      SupplierDebt,
      DebtorCredit,
      ProductGroup,
      ProductVariant,
    ]),
    StockMovementsModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
