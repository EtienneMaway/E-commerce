import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SalesPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  CUSTOM = 'custom',
}

export enum SalesHistoryPeriod {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
  ALL = 'all',
}

export enum TopProductsRankBy {
  QTY = 'qty',
  REVENUE = 'revenue',
  PROFIT = 'profit',
}

export class SalesFilterDto {
  @ApiPropertyOptional({ example: 'Rice' })
  @IsString()
  @IsOptional()
  productName?: string;

  @ApiPropertyOptional({ enum: SalesHistoryPeriod, default: SalesHistoryPeriod.THIRTY_DAYS })
  @IsEnum(SalesHistoryPeriod)
  @IsOptional()
  period?: SalesHistoryPeriod = SalesHistoryPeriod.THIRTY_DAYS;

  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by actor (employee). Omit for all actors.' })
  @IsUUID()
  @IsOptional()
  actorId?: string;
}

export class TopProductsFilterDto {
  @ApiPropertyOptional({ enum: TopProductsRankBy, default: TopProductsRankBy.PROFIT })
  @IsEnum(TopProductsRankBy)
  @IsOptional()
  rankBy?: TopProductsRankBy = TopProductsRankBy.PROFIT;

  @ApiPropertyOptional({ enum: SalesPeriod, default: SalesPeriod.MONTH })
  @IsEnum(SalesPeriod)
  @IsOptional()
  period?: SalesPeriod = SalesPeriod.MONTH;

  @ApiPropertyOptional({ example: '2025-01-01', description: 'Required when period=custom' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2025-03-31' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}
