import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BranchBalance,
  BranchPayment,
  BranchTransfer,
  BranchTransferItem,
  BranchTransferLotDraw,
  InventoryEntry,
  ProductGroup,
  ProductPrice,
  ProductVariant,
  Shop,
  StockCustody,
} from '../entities';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { CurrencyModule } from '../currency/currency.module';
import { BranchTransfersService } from './branch-transfers.service';
import { BranchTransfersController } from './branch-transfers.controller';

/**
 * Depends on nothing that depends on it: custody, dashboard, inventory and
 * shops ask this module questions, and it reads custody and shops straight
 * from their tables rather than importing their modules.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BranchTransfer,
      BranchTransferItem,
      BranchTransferLotDraw,
      BranchBalance,
      BranchPayment,
      InventoryEntry,
      ProductGroup,
      ProductVariant,
      ProductPrice,
      Shop,
      StockCustody,
    ]),
    StockMovementsModule,
    CurrencyModule,
  ],
  controllers: [BranchTransfersController],
  providers: [BranchTransfersService],
  exports: [BranchTransfersService],
})
export class BranchTransfersModule {}
