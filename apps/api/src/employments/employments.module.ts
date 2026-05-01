import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmploymentsController } from './employments.controller';
import { EmploymentsService } from './employments.service';
import { Employment, User } from '../entities';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Employment, User])],
  controllers: [EmploymentsController],
  providers: [EmploymentsService],
  exports: [EmploymentsService],
})
export class EmploymentsModule {}
