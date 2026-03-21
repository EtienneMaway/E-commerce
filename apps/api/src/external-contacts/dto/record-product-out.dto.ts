import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDecimal,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class RecordProductOutDto {
  @ApiProperty({ example: 'Rice 50kg', description: 'Must match an existing inventory product' })
  @IsString()
  @MinLength(2)
  productName: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: '28.00', description: 'Price per unit the debtor owes you' })
  @IsDecimal({ decimal_digits: '1,2' })
  unitPrice: string;

  @ApiPropertyOptional({ example: 'First batch given on credit' })
  @IsString()
  @IsOptional()
  notes?: string;
}
