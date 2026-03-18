import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { DebtorCredit, Payment, SupplierDebt } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, SupplierDebt, DebtorCredit])],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
