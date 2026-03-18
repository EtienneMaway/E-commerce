import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsOptional, IsString, IsUUID } from 'class-validator';

export class PaySupplierDto {
  @ApiProperty({ example: 'uuid-supplier-user' })
  @IsUUID()
  supplierUserId: string;

  @ApiProperty({ example: '150.00', description: 'Amount being paid to the supplier' })
  @IsDecimal({ decimal_digits: '1,2' })
  amount: string;

  @ApiPropertyOptional({ example: 'Partial payment for rice batch' })
  @IsString()
  @IsOptional()
  note?: string;
}
