import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransferEmploymentDto {
  @ApiProperty({ description: 'Branch to move this employee to.' })
  @IsUUID()
  readonly shopId!: string;
}
