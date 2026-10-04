import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EmploymentTier } from '../../entities';

export class ChangeTierDto {
  @ApiProperty({ enum: EmploymentTier, description: 'Tier to propose for this employment.' })
  @IsEnum(EmploymentTier)
  readonly tier!: EmploymentTier;
}
