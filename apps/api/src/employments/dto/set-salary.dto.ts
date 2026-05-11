import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetSalaryDto {
  @ApiPropertyOptional({
    example: 300,
    description: 'Monthly pay in USD. Pass null to clear the target.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyPay?: number | null;
}
