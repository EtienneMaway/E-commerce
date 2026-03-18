import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDecimal,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class ConsignToDebtorDto {
  @ApiProperty({ example: 'uuid-debtor-user', description: 'ID of the debtor user' })
  @IsUUID()
  debtorUserId: string;

  @ApiProperty({
    example: 'Rice 50kg',
    description: 'Must match an existing product name in your inventory (case-insensitive)',
  })
  @IsString()
  @MinLength(2)
  productName: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: '28.00', description: 'Agreed price debtor will pay per unit' })
  @IsDecimal({ decimal_digits: '1,2' })
  agreedUnitPrice: string;

  @ApiPropertyOptional({ example: 'Grains' })
  @IsString()
  @IsOptional()
  category?: string;
}
