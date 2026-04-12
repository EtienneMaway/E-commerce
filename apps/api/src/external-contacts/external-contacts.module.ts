import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalContactsController } from './external-contacts.controller';
import { ExternalContactsService } from './external-contacts.service';
import { ExternalContact, ExternalTransaction, InventoryEntry } from '../entities';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalContact, ExternalTransaction, InventoryEntry]),
    StockMovementsModule,
  ],
  controllers: [ExternalContactsController],
  providers: [ExternalContactsService],
})
export class ExternalContactsModule {}
