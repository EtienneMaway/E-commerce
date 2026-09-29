import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class StockIssueItemDto {
  @ApiProperty({ example: 'rice 50kg' })
  @IsString()
  @MaxLength(255)
  productName: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 'uuid-v4', description: 'Size, for sized products' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    example: 'uuid-v4',
    description:
      'Draw from exactly this lot instead of letting SUPPLIER-first priority choose. The opening sweep sets it; a hand-written issue normally leaves it out.',
  })
  @IsOptional()
  @IsUUID()
  sourceEntryId?: string;
}

export class CreateStockIssueDto {
  @ApiProperty({ type: [StockIssueItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockIssueItemDto)
  items: StockIssueItemDto[];

  @ApiPropertyOptional({ example: 'Opening stock for the week' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
