import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ConsignmentRequest,
  ConsignmentItem,
  User,
  InventoryEntry,
  DebtorCredit,
} from '../entities';
import { ConsignmentsService } from './consignments.service';
import { ConsignmentsController } from './consignments.controller';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConsignmentRequest,
      ConsignmentItem,
      User,
      InventoryEntry,
      DebtorCredit,
    ]),
    StockMovementsModule,
  ],
  controllers: [ConsignmentsController],
  providers: [ConsignmentsService],
  exports: [ConsignmentsService],
})
export class ConsignmentsModule {}
