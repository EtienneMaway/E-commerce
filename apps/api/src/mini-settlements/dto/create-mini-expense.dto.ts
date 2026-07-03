import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsEnum, IsOptional, IsString } from 'class-validator';
import { ExpenseCategory } from '../../entities';

export class CreateMiniExpenseDto {
  @ApiProperty({ example: '15000.0000', description: 'Amount spent, in FC' })
  @IsDecimal({ decimal_digits: '0,4' })
  amount: string;

  @ApiProperty({ enum: ExpenseCategory, example: ExpenseCategory.TRANSPORT })
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @ApiPropertyOptional({ example: 'Taxi to the market' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Client-generated idempotency key for offline sync' })
  @IsOptional()
  @IsString()
  clientId?: string;
}
