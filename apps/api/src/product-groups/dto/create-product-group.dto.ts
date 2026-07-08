import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVariantDto } from './create-variant.dto';

export class CreateProductGroupDto {
  @ApiProperty({
    example: 'casserole',
    description: 'Group/product name — stored lowercase, unique per owner',
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'Kitchenware' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    example: '220.0000',
    description:
      'Discounted whole-carton selling price. Omit to disable carton selling.',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  cartonSellingPrice?: string;

  @ApiPropertyOptional({
    example: '180.0000',
    description: 'Cost of one whole carton (what you pay). Must be below the carton selling price.',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  @IsOptional()
  cartonBuyingPrice?: string;

  @ApiProperty({
    type: [CreateVariantDto],
    description: 'The sizes that make up this product (at least one)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}
