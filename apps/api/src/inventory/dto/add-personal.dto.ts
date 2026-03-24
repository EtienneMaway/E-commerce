import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDecimal,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddPersonalDto {
  @ApiProperty({ example: 'Rice 50kg' })
  @IsString()
  @MinLength(2)
  productName: string;

  @ApiProperty({ example: '25.00', description: 'Cost price you paid per unit' })
  @IsDecimal({ decimal_digits: '1,2' })
  unitCost: string;

  @ApiProperty({ example: '30.00', description: 'Price you intend to sell at' })
  @IsDecimal({ decimal_digits: '1,2' })
  sellingPrice: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 'Grains' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 20, description: 'How many pieces make one carton' })
  @IsInt()
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  piecesPerCarton?: number;
}
