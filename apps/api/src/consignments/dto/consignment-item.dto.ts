import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  MinLength,
  IsInt,
  IsPositive,
  IsDecimal,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class ConsignmentItemDto {
  @ApiProperty({ example: 'Rice 50kg', description: 'Product name (must exist in supplier inventory)' })
  @IsString()
  @MinLength(1)
  productName: string;

  @ApiPropertyOptional({
    description:
      'Consign one size of a sized product. When set, stock is matched by this ' +
      'size and the CONSIGNED lots are tagged with it; productName is derived from the group.',
  })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ example: 10, description: 'Quantity to consign' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: '32.0000', description: 'Agreed price per unit the debtor will owe' })
  @IsDecimal({ decimal_digits: '1,4' })
  agreedUnitPrice: string;

  @ApiPropertyOptional({ description: 'Required (employee only) when below owner\'s standard price' })
  @IsString()
  @IsOptional()
  discountReason?: string;
}
