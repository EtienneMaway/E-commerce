import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  MinLength,
  IsInt,
  IsPositive,
  IsDecimal,
  IsOptional,
} from 'class-validator';

export class ConsignmentItemDto {
  @ApiProperty({ example: 'Rice 50kg', description: 'Product name (must exist in supplier inventory)' })
  @IsString()
  @MinLength(1)
  productName: string;

  @ApiProperty({ example: 10, description: 'Quantity to consign' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: '32.00', description: 'Agreed price per unit the debtor will owe' })
  @IsDecimal({ decimal_digits: '0,2' })
  agreedUnitPrice: string;

  @ApiPropertyOptional({ description: 'Required (employee only) when below owner\'s standard price' })
  @IsString()
  @IsOptional()
  discountReason?: string;
}
