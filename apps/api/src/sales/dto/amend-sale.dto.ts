import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { RecordSaleDto } from './record-sale.dto';

/**
 * Amend a sale recorded with the wrong quantity or price, the same day it was
 * made. The body describes what the sale SHOULD have been — the same shape as
 * recording a fresh sale (quantity/size/carton/price) — plus an optional note.
 * The server voids the original rows (restoring their stock) and re-records
 * this corrected sale in one transaction, so every normal guard still applies:
 * stock availability and the price-guard 422 (resend with confirmedOverride).
 */
export class AmendSaleDto extends RecordSaleDto {
  @ApiPropertyOptional({
    example: 'Charged carton price on a single piece',
    description: 'Optional note kept on the voided original explaining the correction',
  })
  @IsString()
  @IsOptional()
  amendReason?: string;
}
