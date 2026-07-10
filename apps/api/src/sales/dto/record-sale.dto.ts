import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDecimal,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class RecordSaleDto {
  @ApiProperty({ example: 'Rice 50kg' })
  @IsString()
  @MinLength(2)
  productName: string;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Pieces sold. Required for a simple or single-size sale; ignored for a ' +
      'whole-carton sale (use cartonQty instead).',
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  qtySold?: number;

  @ApiPropertyOptional({
    example: 'variant-uuid',
    description:
      'Sell one size of a sized product. When set, stock is looked up by this ' +
      'size instead of by product name. Mutually exclusive with carton.',
  })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Sell one or more WHOLE cartons of a sized product at the group carton ' +
      'price. Requires groupId; deducts the carton composition across sizes.',
  })
  @IsBoolean()
  @IsOptional()
  carton?: boolean;

  @ApiPropertyOptional({
    example: 'group-uuid',
    description: 'ProductGroup to sell a carton of (carton sales only)',
  })
  @IsUUID()
  @IsOptional()
  groupId?: string;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Number of whole cartons to sell (carton sales only, default 1)',
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  cartonQty?: number;

  @ApiProperty({
    example: '32.00',
    description: 'Actual selling price per unit',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  salePrice: string;

  @ApiPropertyOptional({
    example: '80000',
    description:
      'FC price per unit the customer paid. Sent by a mini employee so each ' +
      'deducted lot converts this to USD at ITS OWN locked consignment rate — ' +
      'a sale straddling two batches given at different rates is booked exactly ' +
      'per batch. Ignored for lots without a locked rate (owner/full stock).',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  salePriceFc?: string;

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
      "Reason for discounting below the owner's standard price. Required (employee only) when submitted price is below the standard, after a 422 DISCOUNT_REASON_REQUIRED response.",
  })
  @IsString()
  @IsOptional()
  discountReason?: string;

  @ApiPropertyOptional({
    example: '32.00',
    description:
      'Pre-discount unit price to record on the sale for the receipt/history. ' +
      'Sent when the client applied a quantity ("group of prices") discount so ' +
      'the original price is preserved even for owner sales (which the employee ' +
      'pricing rule does not capture). Ignored when the employee pricing rule ' +
      'already captured an original price.',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  originalUnitPrice?: string;

  @ApiPropertyOptional({
    example: 'Jean Mukendi',
    description:
      'Optional buyer name. Surfaced on the sales tab so the merchant can find a past order later.',
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

  @ApiPropertyOptional({
    example: '1719763200000-a1b2c',
    description:
      'Client-generated idempotency key from the offline sync queue. If a sale with this key already exists ' +
      'for the owner, the server returns it unchanged instead of recording a duplicate — making retries on a ' +
      'flaky network safe.',
  })
  @IsString()
  @IsOptional()
  clientSaleId?: string;
}
