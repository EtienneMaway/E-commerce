import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';
import {
  Expense,
  ExternalTransaction,
  Payment,
  SaleTransaction,
  Withdrawal,
} from '../entities';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Withdrawal,
      SaleTransaction,
      Payment,
      ExternalTransaction,
      Expense,
    ]),
    CurrencyModule,
  ],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
