import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalaryPaymentDto {
  @ApiProperty({ example: 'uuid-v4', description: 'Employment to pay against' })
  @IsUUID()
  employmentId: string;

  @ApiProperty({ example: 50, description: 'Amount in USD' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    example: '2026-05',
    description: 'Salary period this payment covers (YYYY-MM). Defaults to the current month.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'periodMonth must be in YYYY-MM format' })
  periodMonth?: string;

  @ApiPropertyOptional({ example: 'May installment #1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Set to true to override the warning when this payment would exceed the period budget.',
  })
  @IsOptional()
  @IsBoolean()
  confirmedOverride?: boolean;
}
