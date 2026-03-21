import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal } from 'class-validator';

export class SetRateDto {
  @ApiProperty({
    example: '2700.0000',
    description: 'Exchange rate: how many FC equal 1 USD. Must be a positive decimal string.',
  })
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  usdToFcRate: string;
}
