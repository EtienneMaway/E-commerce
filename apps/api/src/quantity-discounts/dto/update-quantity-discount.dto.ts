import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, Max, Min } from 'class-validator';

export class UpdateQuantityDiscountDto {
  @ApiProperty({
    example: true,
    description: 'Master on/off switch for quantity discounts across the shop',
  })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    example: 3,
    description: 'Percentage discount applied at half a dozen (quantity ≥ 6)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  halfDozenPercent: number;

  @ApiProperty({
    example: 5,
    description: 'Percentage discount applied at a dozen (quantity ≥ 12)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  dozenPercent: number;

  @ApiProperty({
    example: 8,
    description:
      "Percentage discount applied at a full carton (quantity ≥ the product's pieces-per-carton)",
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  cartonPercent: number;
}
