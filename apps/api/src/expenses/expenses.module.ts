import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { Expense, SaleTransaction } from '../entities';
import { CurrencyModule } from '../currency/currency.module';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, SaleTransaction]), CurrencyModule, DashboardModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
