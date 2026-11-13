import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class BranchTransferItemDto {
  @ApiProperty({ example: 'rice 50kg', description: 'Product name, or the group name for a sized product' })
  @IsString()
  @MaxLength(255)
  productName: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 'uuid-v4', description: "Sending branch's size, for sized products" })
  @IsOptional()
  @IsUUID()
  variantId?: string;
}

export class CreateBranchTransferDto {
  @ApiProperty({ example: 'uuid-v4', description: 'Receiving branch, in the same business' })
  @IsUUID()
  toShopId: string;

  @ApiProperty({ type: [BranchTransferItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BranchTransferItemDto)
  items: BranchTransferItemDto[];

  @ApiPropertyOptional({ example: 'Not moving here, selling fast at the market branch' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
