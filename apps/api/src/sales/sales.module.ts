import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { InventoryEntry, SaleTransaction } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([SaleTransaction, InventoryEntry])],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
