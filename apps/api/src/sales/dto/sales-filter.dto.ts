import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsUuidOrSelf } from '../../common/actor-filter';

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

/**
 * Period presets for the sales profit summary. `today` is the calendar day;
 * `week`/`month` are rolling windows (last 7 / last 30 days); `all` is no
 * bound; `custom` uses dateFrom/dateTo.
 */
export enum SalesSummaryPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  ALL = 'all',
  CUSTOM = 'custom',
}

export class SalesSummaryFilterDto {
  @ApiPropertyOptional({ enum: SalesSummaryPeriod, default: SalesSummaryPeriod.TODAY })
  @IsEnum(SalesSummaryPeriod)
  @IsOptional()
  period?: SalesSummaryPeriod = SalesSummaryPeriod.TODAY;

  @ApiPropertyOptional({ example: '2025-01-01', description: 'Start of range (used when period=custom)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2025-01-31', description: 'End of range, inclusive (used when period=custom)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ example: 'Rice', description: 'Optional: restrict the summary to one product' })
  @IsString()
  @IsOptional()
  productName?: string;

  @ApiPropertyOptional({ description: "Optional: restrict the summary to one actor. A UUID targets one employee; 'self' targets the current viewer's own rows; omit for all actors." })
  @IsUuidOrSelf()
  @IsOptional()
  actorId?: string;
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

  @ApiPropertyOptional({ description: "Filter by actor. UUID = one employee; 'self' = the current viewer's own rows; omit for all actors." })
  @IsUuidOrSelf()
  @IsOptional()
  actorId?: string;

  @ApiPropertyOptional({
    description:
      'Free-text search across client name + phone. Mobile sales tab uses this to find a past order when the merchant remembers the buyer.',
    example: 'mukendi',
  })
  @IsString()
  @IsOptional()
  clientQuery?: string;
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
