import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsOptional } from 'class-validator';

export class SetRateDto {
  @ApiProperty({
    example: '2700.0000',
    description: 'Exchange rate: how many FC equal 1 USD. Must be a positive decimal string.',
  })
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  usdToFcRate: string;

  @ApiPropertyOptional({
    example: '2750.0000',
    description: 'Selling rate for personal product entry in FC. If omitted, not updated.',
  })
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  @IsOptional()
  sellingRate?: string;
}
