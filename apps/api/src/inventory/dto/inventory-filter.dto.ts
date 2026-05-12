import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { InventorySource } from '../../entities';

export class InventoryFilterDto {
  @ApiPropertyOptional({ enum: InventorySource })
  @IsEnum(InventorySource)
  @IsOptional()
  source?: InventorySource;

  @ApiPropertyOptional({ example: 'uuid-supplier' })
  @IsUUID()
  @IsOptional()
  supplierUserId?: string;

  @ApiPropertyOptional({ example: 'Grains' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'rice 50kg' })
  @IsString()
  @IsOptional()
  productName?: string;

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
