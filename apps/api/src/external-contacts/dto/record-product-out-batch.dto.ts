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

export class ProductOutBatchItemDto {
  @ApiProperty({ example: 'Rice 50kg' })
  @IsString()
  @MinLength(2)
  productName: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: '28.00' })
  @IsDecimal({ decimal_digits: '1,2' })
  unitPrice: string;

  @ApiPropertyOptional({ description: 'Required (employee only) when below owner\'s standard price' })
  @IsString()
  @IsOptional()
  discountReason?: string;
}

export class RecordProductOutBatchDto {
  @ApiProperty({ type: [ProductOutBatchItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductOutBatchItemDto)
  items: ProductOutBatchItemDto[];

  @ApiPropertyOptional({ example: 'Monthly delivery batch — invoice #42' })
  @IsString()
  @IsOptional()
  notes?: string;
}
