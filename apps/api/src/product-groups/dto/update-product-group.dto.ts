import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDecimal, IsOptional, IsString } from 'class-validator';

/**
 * Edit a group's metadata. Renaming a group (which must cascade the new name
 * across inventory_entries and sale_transactions, guarding active consignments)
 * is deferred to Phase 6 — `name` is intentionally not accepted here.
 */
export class UpdateProductGroupDto {
  @ApiPropertyOptional({ example: 'Kitchenware' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    example: '220.0000',
    description:
      'New whole-carton selling price. Send "0" to keep, omit to leave unchanged.',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  cartonSellingPrice?: string;

  @ApiPropertyOptional({
    example: '180.0000',
    description: 'Cost of one whole carton. Must stay below the carton selling price.',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  cartonBuyingPrice?: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  archived?: boolean;
}
