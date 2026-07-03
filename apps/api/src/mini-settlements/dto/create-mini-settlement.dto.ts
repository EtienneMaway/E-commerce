import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsDecimal,
  ValidateNested,
} from 'class-validator';

export class MiniSettlementReturnItemDto {
  @ApiProperty({ example: 'rice 50kg' })
  @IsString()
  productName: string;

  @ApiProperty({ example: 5, description: 'Unsold units being returned' })
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateMiniSettlementDto {
  @ApiPropertyOptional({
    example: '150.0000',
    description: 'Cash handed over for goods sold (at the owner-set agreed price). Defaults to 0.',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '1,4' })
  cashAmount?: string;

  @ApiPropertyOptional({
    example: '405000.0000',
    description:
      "FC value of the sold cash at the batches' locked rates (from the app's handover preview). Persisted so the owner sees a locked-rate Net pay.",
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '1,4' })
  cashAmountFc?: string;

  @ApiPropertyOptional({ type: [MiniSettlementReturnItemDto], description: 'Unsold items being returned to the owner' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MiniSettlementReturnItemDto)
  returns?: MiniSettlementReturnItemDto[];

  @ApiPropertyOptional({ example: 'End of week close-out' })
  @IsOptional()
  @IsString()
  note?: string;
}
