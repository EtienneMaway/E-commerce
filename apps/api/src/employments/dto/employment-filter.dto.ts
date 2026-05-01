import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentStatus } from '../../entities';

export enum EmploymentRoleFilter {
  EMPLOYER = 'employer',
  EMPLOYEE = 'employee',
}

export class EmploymentFilterDto {
  @ApiPropertyOptional({ enum: EmploymentRoleFilter, description: 'List employments where I am the employer or the employee' })
  @IsOptional()
  @IsEnum(EmploymentRoleFilter)
  role?: EmploymentRoleFilter;

  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus;
}
