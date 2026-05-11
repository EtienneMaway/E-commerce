import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectSalaryPaymentDto {
  @ApiPropertyOptional({ example: 'Cash never received' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
