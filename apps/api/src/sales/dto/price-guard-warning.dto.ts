import { ApiProperty } from '@nestjs/swagger';

export class PriceGuardWarningDto {
  @ApiProperty({ example: true })
  warning: true;

  @ApiProperty({ example: '25.00' })
  costPrice: string;

  @ApiProperty({ example: '-30.00', description: 'Negative value = loss per unit × qty' })
  potentialLoss: string;

  @ApiProperty({
    example: 'Selling at 20.00 is below cost price of 25.00. You will lose 30.00 total. Send confirmedOverride: true to proceed.',
  })
  message: string;
}
