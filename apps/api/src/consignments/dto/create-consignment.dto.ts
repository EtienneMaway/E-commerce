import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { ConsignmentItemDto } from './consignment-item.dto';

export class CreateConsignmentDto {
  @ApiProperty({ example: 'uuid-of-debtor', description: 'User ID of the debtor receiving goods' })
  @IsUUID()
  debtorUserId: string;

  @ApiPropertyOptional({ example: 'Please confirm within 48h', description: 'Optional message to debtor' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [ConsignmentItemDto], description: 'One or more products to consign' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsignmentItemDto)
  items: ConsignmentItemDto[];
}
