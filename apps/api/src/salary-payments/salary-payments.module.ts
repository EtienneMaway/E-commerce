import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalaryPaymentsController } from './salary-payments.controller';
import { SalaryPaymentsService } from './salary-payments.service';
import { Employment, SalaryPayment } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([SalaryPayment, Employment])],
  controllers: [SalaryPaymentsController],
  providers: [SalaryPaymentsService],
  exports: [SalaryPaymentsService],
})
export class SalaryPaymentsModule {}
