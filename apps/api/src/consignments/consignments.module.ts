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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConsignmentRequest,
      ConsignmentItem,
      User,
      InventoryEntry,
      DebtorCredit,
    ]),
  ],
  controllers: [ConsignmentsController],
  providers: [ConsignmentsService],
  exports: [ConsignmentsService],
})
export class ConsignmentsModule {}
