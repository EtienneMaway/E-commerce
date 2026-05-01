import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDecimal,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class RecordSaleDto {
  @ApiProperty({ example: 'Rice 50kg' })
  @IsString()
  @MinLength(2)
  productName: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @IsPositive()
  qtySold: number;

  @ApiProperty({ example: '32.00', description: 'Actual selling price per unit' })
  @IsDecimal({ decimal_digits: '1,2' })
  salePrice: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Must be true to confirm a sale below cost price after receiving the 422 warning',
  })
  @IsBoolean()
  @IsOptional()
  confirmedOverride?: boolean;

  @ApiPropertyOptional({
    example: 'Loyal customer',
    description:
      'Reason for discounting below the owner\'s standard price. Required (employee only) when submitted price is below the standard, after a 422 DISCOUNT_REASON_REQUIRED response.',
  })
  @IsString()
  @IsOptional()
  discountReason?: string;
}
