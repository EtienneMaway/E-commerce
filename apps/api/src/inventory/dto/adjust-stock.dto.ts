import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ManualStockMovementReason } from '../../entities';

export class AdjustStockDto {
  @ApiProperty({ enum: ManualStockMovementReason, example: ManualStockMovementReason.DAMAGE })
  @IsEnum(ManualStockMovementReason)
  reason: ManualStockMovementReason;

  @ApiProperty({ example: 5, description: 'Always positive — the server resolves the sign from the reason.' })
  @IsInt()
  @IsPositive()
  qty: number;

  @ApiPropertyOptional({
    example: 'Counted 47 on shelf B, system showed 50',
    description: 'Required when reason is RECOUNT_UP, RECOUNT_DOWN, OTHER_IN, or OTHER_OUT.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
