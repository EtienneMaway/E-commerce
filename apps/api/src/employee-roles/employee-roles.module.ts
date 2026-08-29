import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeRolesController } from './employee-roles.controller';
import { EmployeeRolesService } from './employee-roles.service';
import { EmployeeRole, Employment } from '../entities';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EmployeeRole, Employment])],
  controllers: [EmployeeRolesController],
  providers: [EmployeeRolesService],
  exports: [EmployeeRolesService],
})
export class EmployeeRolesModule {}
