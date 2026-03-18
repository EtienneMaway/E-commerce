import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordDebtorPaymentDto {
  @ApiProperty({ example: 'uuid-debtor-user' })
  @IsUUID()
  debtorUserId: string;

  @ApiProperty({ example: '100.00', description: 'Amount received from the debtor' })
  @IsDecimal({ decimal_digits: '1,2' })
  amount: string;

  @ApiPropertyOptional({ example: 'Received via mobile money' })
  @IsString()
  @IsOptional()
  note?: string;
}
