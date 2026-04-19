import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsDecimal,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ExpenseCategory, ExpenseCurrency } from '../../entities';

export class CreateExpenseDto {
  @ApiProperty({ example: '25.00', description: 'Amount in the chosen currency' })
  @IsDecimal({ decimal_digits: '1,2' })
  amount: string;

  @ApiProperty({ enum: ExpenseCurrency, example: ExpenseCurrency.USD })
  @IsEnum(ExpenseCurrency)
  currency: ExpenseCurrency;

  @ApiProperty({ enum: ExpenseCategory, example: ExpenseCategory.TRANSPORT })
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @ApiPropertyOptional({ example: 'Taxi to supplier warehouse' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: '2026-04-19T10:00:00.000Z',
    description: 'Defaults to now if omitted',
  })
  @IsDateString()
  @IsOptional()
  date?: string;
}
