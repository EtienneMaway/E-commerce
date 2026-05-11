import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SalaryPaymentStatus } from '../../entities';

export enum SalaryRoleFilter {
  EMPLOYER = 'employer',
  EMPLOYEE = 'employee',
}

export class ListSalaryPaymentsDto {
  @ApiPropertyOptional({
    enum: SalaryRoleFilter,
    description: 'Perspective to list from. Defaults to employer.',
  })
  @IsOptional()
  @IsEnum(SalaryRoleFilter)
  role?: SalaryRoleFilter;

  @ApiPropertyOptional({ description: 'Filter to a single employment' })
  @IsOptional()
  @IsUUID()
  employmentId?: string;

  @ApiPropertyOptional({ enum: SalaryPaymentStatus })
  @IsOptional()
  @IsEnum(SalaryPaymentStatus)
  status?: SalaryPaymentStatus;

  @ApiPropertyOptional({ example: '2026-05', description: 'Filter by salary period (YYYY-MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodMonth?: string;
}
