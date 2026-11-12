import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BranchPaymentCurrency } from '../../entities';

export class CreateBranchPaymentDto {
  @ApiProperty({ example: 'uuid-v4', description: 'The branch being paid back (the one that gave the goods)' })
  @IsUUID()
  toShopId: string;

  @ApiProperty({ example: '270000', description: 'Amount in the currency handed over' })
  @IsDecimal({ decimal_digits: '0,4' })
  amount: string;

  @ApiProperty({ enum: BranchPaymentCurrency, example: BranchPaymentCurrency.FC })
  @IsEnum(BranchPaymentCurrency)
  currency: BranchPaymentCurrency;

  @ApiPropertyOptional({ example: 'Cash sent with the driver' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
