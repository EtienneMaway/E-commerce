import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsOptional, IsString } from 'class-validator';

export class RecordPaymentInDto {
  @ApiProperty({ example: '100.00', description: 'Cash amount received from external debtor' })
  @IsDecimal({ decimal_digits: '1,2' })
  amount: string;

  @ApiPropertyOptional({ example: 'Partial payment in cash' })
  @IsString()
  @IsOptional()
  notes?: string;
}
