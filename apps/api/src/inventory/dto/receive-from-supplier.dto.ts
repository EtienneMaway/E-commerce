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

export class ReceiveFromSupplierDto {
  @ApiProperty({ example: 'uuid-supplier-user', description: 'ID of the supplier user' })
  @IsUUID()
  supplierUserId: string;

  @ApiProperty({ example: 'Rice 50kg' })
  @IsString()
  @MinLength(2)
  productName: string;

  @ApiProperty({ example: '22.00', description: 'Agreed price to pay supplier per unit' })
  @IsDecimal({ decimal_digits: '1,2' })
  unitCost: string;

  @ApiProperty({ example: '30.00', description: 'Price you intend to sell at' })
  @IsDecimal({ decimal_digits: '1,2' })
  sellingPrice: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 'Grains' })
  @IsString()
  @IsOptional()
  category?: string;
}
