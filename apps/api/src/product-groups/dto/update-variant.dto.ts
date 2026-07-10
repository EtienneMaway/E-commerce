import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDecimal,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateVariantDto {
  @ApiPropertyOptional({ example: 'extra-large' })
  @IsString()
  @MinLength(1)
  @IsOptional()
  label?: string;

  @ApiPropertyOptional({ example: '4.5000' })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  unitCost?: string;

  @ApiPropertyOptional({ example: '7.0000' })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  sellingPrice?: string;

  @ApiPropertyOptional({ example: 24 })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  piecesPerCarton?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  archived?: boolean;
}
