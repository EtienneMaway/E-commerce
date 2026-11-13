import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../common/pagination';
import { ConsignmentStatus } from '../../entities';

export class ListConsignmentsDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ConsignmentStatus, example: ConsignmentStatus.PENDING })
  @IsEnum(ConsignmentStatus)
  @IsOptional()
  status?: ConsignmentStatus;
}
