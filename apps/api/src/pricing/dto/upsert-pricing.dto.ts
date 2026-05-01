import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertPricingDto {
  @ApiProperty({ example: 'Rice 50kg' })
  @IsString()
  @IsNotEmpty()
  productName: string;

  @ApiProperty({ example: '30.00' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'unitPrice must be a positive decimal with up to 2 places' })
  unitPrice: string;
}

export class UpdatePricingDto {
  @ApiProperty({ example: '31.50' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'unitPrice must be a positive decimal with up to 2 places' })
  unitPrice: string;
}
