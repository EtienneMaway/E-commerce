import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { ExpenseCategory } from '../../entities';

export enum ExpensePeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  LAST_N_DAYS = 'lastNDays',
  ALL = 'all',
}

export class ListExpensesQueryDto {
  @ApiPropertyOptional({ enum: ExpensePeriod, example: ExpensePeriod.MONTH })
  @IsEnum(ExpensePeriod)
  @IsOptional()
  period?: ExpensePeriod;

  @ApiPropertyOptional({ example: 7, description: 'Days count when period=lastNDays' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  days?: number;

  @ApiPropertyOptional({ example: '2026-04-01', description: 'Start date (ISO). Overrides period.' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-04-30', description: 'End date (ISO, inclusive). Overrides period.' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory)
  @IsOptional()
  category?: ExpenseCategory;

  @ApiPropertyOptional({ description: 'Filter by actor (employee). Omit for all actors.' })
  @IsUUID()
  @IsOptional()
  actorId?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 10;
}
