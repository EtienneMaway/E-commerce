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
  @IsDecimal({ decimal_digits: '1,4' })
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

  @ApiPropertyOptional({
    example: 'Jean Mukendi',
    description: 'Optional buyer name. Surfaced on the sales tab so the merchant can find a past order later.',
  })
  @IsString()
  @IsOptional()
  clientName?: string;

  @ApiPropertyOptional({
    example: '+243 836 743 579',
    description: 'Optional buyer phone. Searchable from the sales tab.',
  })
  @IsString()
  @IsOptional()
  clientPhone?: string;

  @ApiPropertyOptional({
    example: 'RCP-AB12CD',
    description:
      'Optional client-generated receipt identifier — pass the same value for every sale row in one cart submission ' +
      'so they can be regrouped into a single reprintable receipt later.',
  })
  @IsString()
  @IsOptional()
  receiptId?: string;
}
