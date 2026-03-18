import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  MinLength,
  IsInt,
  IsPositive,
  IsDecimal,
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
}
