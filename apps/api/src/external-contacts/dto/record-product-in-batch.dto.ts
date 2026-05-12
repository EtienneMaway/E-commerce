import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProductInBatchItemDto {
  @ApiProperty({ example: 'Rice 50kg' })
  @IsString()
  @MinLength(2)
  productName: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: '22.00', description: 'What you agreed to pay per unit' })
  @IsDecimal({ decimal_digits: '1,2' })
  unitCost: string;

  @ApiProperty({ example: '30.00', description: 'Your intended selling price' })
  @IsDecimal({ decimal_digits: '1,2' })
  sellingPrice: string;

  @ApiPropertyOptional({ example: 'Grains' })
  @IsString()
  @IsOptional()
  category?: string;
}

export class RecordProductInBatchDto {
  @ApiProperty({ type: [ProductInBatchItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductInBatchItemDto)
  items: ProductInBatchItemDto[];

  @ApiPropertyOptional({ example: 'Delivery from Jean — receipt #102' })
  @IsString()
  @IsOptional()
  notes?: string;
}
