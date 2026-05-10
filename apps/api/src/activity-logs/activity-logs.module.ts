import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogsController } from './activity-logs.controller';
import { ActivityLogsService } from './activity-logs.service';
import {
  ConsignmentItem,
  Expense,
  ExternalContact,
  ExternalTransaction,
  InventoryEntry,
  Payment,
  SaleTransaction,
  User,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SaleTransaction,
      ConsignmentItem,
      ExternalTransaction,
      ExternalContact,
      Payment,
      Expense,
      InventoryEntry,
      User,
    ]),
  ],
  controllers: [ActivityLogsController],
  providers: [ActivityLogsService],
})
export class ActivityLogsModule {}
