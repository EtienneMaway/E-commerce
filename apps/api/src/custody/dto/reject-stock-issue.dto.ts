import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectStockIssueDto {
  @ApiPropertyOptional({ example: 'Two cartons are damaged, I am not taking them' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
