import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CustodyAdjustmentKind } from '../../entities';

/**
 * A line the owner types by hand onto a handover (`SHOP_CUSTODY_PLAN.md` §3.8).
 *
 * Deliberately dumb: the app does not compute the shortage, guess at a cause or
 * reconcile anything. The owner counts, decides, and writes the figure in with
 * a reason. `note` is required on every line because a figure without a reason
 * is not a record.
 */
export class CreateHandoverAdjustmentDto {
  @ApiProperty({ enum: CustodyAdjustmentKind })
  @IsEnum(CustodyAdjustmentKind)
  kind: CustodyAdjustmentKind;

  @ApiPropertyOptional({
    example: '5000.0000',
    description: 'FC, always positive — the `kind` carries the direction. Required on cash lines.',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '1,4' })
  amountFc?: string;

  @ApiPropertyOptional({
    example: 'uuid-v4',
    description:
      'The custody lot an item line applies to. Required on ITEM_MISSING / ITEM_FOUND, since approval writes a typed stock movement against it.',
  })
  @IsOptional()
  @IsUUID()
  inventoryEntryId?: string;

  @ApiPropertyOptional({ example: 3, description: 'Units missing or found. Required on item lines.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity?: number;

  @ApiProperty({ example: 'Three bags short, says a client took them Friday' })
  @IsString()
  @MaxLength(255)
  note: string;
}
