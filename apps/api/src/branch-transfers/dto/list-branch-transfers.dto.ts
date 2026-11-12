import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { BranchTransferStatus } from '../../entities';
import { PageQueryDto } from '../../common/pagination';

export const BRANCH_TRANSFER_DIRECTIONS = ['incoming', 'outgoing'] as const;
export type BranchTransferDirection = (typeof BRANCH_TRANSFER_DIRECTIONS)[number];

export class ListBranchTransfersDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: BRANCH_TRANSFER_DIRECTIONS, description: 'Relative to the selected branch' })
  @IsOptional()
  @IsIn(BRANCH_TRANSFER_DIRECTIONS)
  direction?: BranchTransferDirection;

  @ApiPropertyOptional({ enum: BranchTransferStatus })
  @IsOptional()
  @IsEnum(BranchTransferStatus)
  status?: BranchTransferStatus;
}
