import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetCommissionDto {
  @ApiPropertyOptional({
    example: 10,
    description:
      "Commission the employer pays a mini employee, as a percentage of each approved handover's sold value. Pass null to remove the commission (future handovers earn nothing; already-approved ones keep their sealed rate).",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionPct?: number | null;
}
