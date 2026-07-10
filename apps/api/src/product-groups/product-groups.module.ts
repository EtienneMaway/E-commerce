import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductGroupsController } from './product-groups.controller';
import { ProductGroupsService } from './product-groups.service';
import { InventoryEntry, ProductGroup, ProductVariant } from '../entities';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductGroup, ProductVariant, InventoryEntry]),
    StockMovementsModule,
  ],
  controllers: [ProductGroupsController],
  providers: [ProductGroupsService],
  exports: [ProductGroupsService],
})
export class ProductGroupsModule {}
