import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * One optional teammate travelling with the goods. Free-text on purpose — these
 * are people off the books, not app users, and nothing in the ledger keys off
 * them.
 */
export class ConsignmentTeamMemberDto {
  @ApiProperty({ example: 'Jean Kabila', description: 'Name of the person teaming up with the recipient' })
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
