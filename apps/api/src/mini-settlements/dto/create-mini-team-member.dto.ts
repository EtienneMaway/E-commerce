import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * One person the mini is out selling with this cycle. Free-text — these are not
 * app users, carry no permissions, and nothing in the ledger references them.
 */
export class CreateMiniTeamMemberDto {
  @ApiProperty({ example: 'Jean Kabila' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: '+243 990 000 000' })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  phone?: string;
}
