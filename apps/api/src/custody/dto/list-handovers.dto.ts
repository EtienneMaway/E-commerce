import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';
import { CustodyHandoverStatus } from '../../entities';

/**
 * The owner's "handovers of all full employees" view: one list, filtered by
 * whichever of person, branch and state they care about.
 */
export class ListCustodyHandoversDto {
  @ApiPropertyOptional({ description: 'Only this employee, across branches and appointments' })
  @IsOptional()
  @IsUUID()
  custodianId?: string;

  @ApiPropertyOptional({ enum: CustodyHandoverStatus })
  @IsOptional()
  @IsEnum(CustodyHandoverStatus)
  status?: CustodyHandoverStatus;
}

export class RejectCustodyHandoverDto {
  @ApiPropertyOptional({ example: 'Count the rice again' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
