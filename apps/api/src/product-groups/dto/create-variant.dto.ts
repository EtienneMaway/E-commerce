import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDecimal,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVariantDto {
  @ApiProperty({
    example: 'large',
    description: 'Size label — stored lowercase, unique within the group',
  })
  @IsString()
  @MinLength(1)
  label: string;

  @ApiPropertyOptional({
    example: '4.0000',
    description: 'Cost per piece of this size. Optional — normally derived from the carton buying price.',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  unitCost?: string;

  @ApiProperty({
    example: '6.0000',
    description: 'Standard price you sell one piece of this size at',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  sellingPrice: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'How many of this size are in one carton (defaults to 1)',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  piecesPerCarton?: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'Display order within the group',
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;
}
