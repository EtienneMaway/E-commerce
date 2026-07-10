import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsUUID } from 'class-validator';

export class UpdateMiniCartonPriceDto {
  @ApiProperty({ example: 'group-uuid', description: 'The sized product (group) to set the carton price for' })
  @IsUUID()
  groupId: string;

  @ApiProperty({ example: '10.0000', description: 'The FC/USD selling price for one whole carton the mini will charge' })
  @IsDecimal({ decimal_digits: '1,4' })
  cartonSellingPrice: string;
}
