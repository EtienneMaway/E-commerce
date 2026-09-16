import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TransferOwnershipDto {
  @ApiProperty({ description: 'The account being offered the business.' })
  @IsUUID()
  readonly newOwnerUserId!: string;

  @ApiPropertyOptional({ example: 'Handing over to my son' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly note?: string;
}
