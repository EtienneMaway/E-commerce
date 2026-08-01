import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { ConsignmentItemDto } from './consignment-item.dto';
import { ConsignmentTeamMemberDto } from './consignment-team-member.dto';

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

  @ApiPropertyOptional({
    type: [ConsignmentTeamMemberDto],
    description:
      'Optional people teaming up with the recipient on this batch — recorded for ' +
      'the owner\'s reference until the handover that closes the cycle. No ledger effect.',
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConsignmentTeamMemberDto)
  teamMembers?: ConsignmentTeamMemberDto[];
}
