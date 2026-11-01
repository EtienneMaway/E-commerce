import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsOptional } from 'class-validator';

/**
 * Edit the buying (unit cost) and/or selling price on one on-shelf inventory
 * lot. Both fields are optional — send whichever you are changing — but the
 * service rejects a body with neither. Only ever applied to the lot's own
 * columns, which affect the REMAINING quantity's future sales; already-sold,
 * consigned-out and mini-given quantities keep the price snapshotted at the
 * time they left the shelf.
 */
export class UpdateEntryPricesDto {
  @ApiPropertyOptional({
    example: '26.00',
    description: 'New buying price (unit cost) for the remaining stock in this lot',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '1,4' })
  unitCost?: string;

  @ApiPropertyOptional({
    example: '35.00',
    description: 'New selling price for the remaining stock in this lot',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '1,4' })
  sellingPrice?: string;
}
