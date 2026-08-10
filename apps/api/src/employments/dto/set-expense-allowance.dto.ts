import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal } from 'class-validator';

export class SetExpenseAllowanceDto {
  @ApiProperty({
    example: '5.00',
    description:
      'Percentage of what the employee has sold that they may claim in expenses (mini: this handover cycle; full employee: that calendar day). Always applies; set a high value for an effectively unrestricted employee.',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  expenseAllowancePct: string;
}
