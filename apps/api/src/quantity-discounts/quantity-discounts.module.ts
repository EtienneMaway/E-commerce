import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuantityDiscountsController } from './quantity-discounts.controller';
import { QuantityDiscountsService } from './quantity-discounts.service';
import { QuantityDiscount } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([QuantityDiscount])],
  controllers: [QuantityDiscountsController],
  providers: [QuantityDiscountsService],
  exports: [QuantityDiscountsService],
})
export class QuantityDiscountsModule {}
