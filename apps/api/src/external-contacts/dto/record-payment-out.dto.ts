import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsOptional, IsString } from 'class-validator';

export class RecordPaymentOutDto {
  @ApiProperty({ example: '100.00', description: 'Cash amount paid to external supplier' })
  @IsDecimal({ decimal_digits: '1,2' })
  amount: string;

  @ApiPropertyOptional({ example: 'Partial payment for rice batch' })
  @IsString()
  @IsOptional()
  notes?: string;
}
