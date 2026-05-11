import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SalarySummaryQueryDto {
  @ApiProperty({ description: 'Employment to summarise' })
  @IsUUID()
  employmentId: string;

  @ApiPropertyOptional({ example: '2026-05', description: 'Period to summarise (YYYY-MM). Defaults to current month.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodMonth?: string;
}
