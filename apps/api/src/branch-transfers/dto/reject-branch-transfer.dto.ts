import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectBranchTransferDto {
  @ApiProperty({ example: 'Three cartons are missing from what was announced' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
