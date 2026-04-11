import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { InventorySource, StockMovementReason } from '../../entities';

export class StockMovementsFilterDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  entryId?: string;

  @ApiPropertyOptional({ example: 'rice 50kg' })
  @IsString()
  @IsOptional()
  productName?: string;

  @ApiPropertyOptional({
    enum: StockMovementReason,
    isArray: true,
    description: 'Comma-separated list of reasons or repeat the param',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value;
    return String(value).split(',').map((s) => s.trim()).filter(Boolean);
  })
  @IsArray()
  @IsEnum(StockMovementReason, { each: true })
  reason?: StockMovementReason[];

  @ApiPropertyOptional({ enum: InventorySource })
  @IsEnum(InventorySource)
  @IsOptional()
  source?: InventorySource;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
