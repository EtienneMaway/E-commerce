import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmploymentsController } from './employments.controller';
import { EmploymentsService } from './employments.service';
import { EmployeeRole, Employment, User } from '../entities';
import { CustodyModule } from '../custody/custody.module';

@Global()
@Module({
  imports: [
    CustodyModule,TypeOrmModule.forFeature([Employment, EmployeeRole, User])],
  controllers: [EmploymentsController],
  providers: [EmploymentsService],
  exports: [EmploymentsService],
})
export class EmploymentsModule {}
