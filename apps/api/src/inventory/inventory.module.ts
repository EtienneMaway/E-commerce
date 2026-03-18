import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import {
  DebtorCredit,
  InventoryEntry,
  SupplierDebt,
  User,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryEntry, User, SupplierDebt, DebtorCredit]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
