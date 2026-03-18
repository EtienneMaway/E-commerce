import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal } from 'class-validator';

export class UpdateSellingPriceDto {
  @ApiProperty({ example: '35.00', description: 'New selling price for this inventory entry' })
  @IsDecimal({ decimal_digits: '1,2' })
  sellingPrice: string;
}
