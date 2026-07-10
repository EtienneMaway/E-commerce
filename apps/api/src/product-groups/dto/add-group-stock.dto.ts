import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddGroupStockItemDto {
  @ApiProperty({
    example: 'variant-uuid',
    description: 'Which size this stock is for',
  })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 40, description: 'Pieces of this size being added' })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional({
    example: '4.0000',
    description:
      "Cost paid per piece for this batch. Defaults to the size's current cost.",
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  unitCost?: string;

  @ApiPropertyOptional({
    example: '6.0000',
    description:
      "Selling price for this batch. Defaults to the size's current price.",
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  sellingPrice?: string;
}

export class AddGroupStockDto {
  @ApiProperty({ type: [AddGroupStockItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AddGroupStockItemDto)
  items: AddGroupStockItemDto[];
}
