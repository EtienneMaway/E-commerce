import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class MiniActivityQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01', description: 'Inclusive lower bound (YYYY-MM-DD) for the sales window' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-31', description: 'Inclusive upper bound (YYYY-MM-DD) for the sales window' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
