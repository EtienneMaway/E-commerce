import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPayrollActiveDto {
  @ApiProperty({ example: true, description: 'true = include in payroll, false = pause' })
  @IsBoolean()
  active: boolean;
}
