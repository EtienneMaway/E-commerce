import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDecimal,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WithdrawalCurrency } from '../../entities';

export class CreateWithdrawalDto {
  @ApiProperty({ example: '100.00', description: 'Amount to withdraw in the chosen currency' })
  @IsDecimal({ decimal_digits: '1,2' })
  amount: string;

  @ApiProperty({ enum: WithdrawalCurrency, example: WithdrawalCurrency.USD })
  @IsEnum(WithdrawalCurrency)
  currency: WithdrawalCurrency;

  @ApiPropertyOptional({ example: 'Cash for Kinshasa restock trip' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
