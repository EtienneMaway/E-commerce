import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDecimal,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class RecordProductInDto {
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

  @ApiPropertyOptional({ example: 'First delivery from Jean' })
  @IsString()
  @IsOptional()
  notes?: string;
}
