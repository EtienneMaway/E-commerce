import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal } from 'class-validator';

export class SetExpenseAllowanceDto {
  @ApiProperty({
    example: '5.00',
    description:
      'Percentage of what the mini has sold this cycle that they may claim in expenses. Always applies; set a high value for an effectively unrestricted mini.',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  expenseAllowancePct: string;
}
