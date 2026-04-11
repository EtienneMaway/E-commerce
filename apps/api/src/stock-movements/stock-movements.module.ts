import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockMovement } from '../entities';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementsController } from './stock-movements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StockMovement])],
  providers: [StockMovementsService],
  controllers: [StockMovementsController],
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
