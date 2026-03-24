import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
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
}
