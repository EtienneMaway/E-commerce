import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentTier } from '../../entities';

export class CreateEmploymentDto {
  @ApiPropertyOptional({ description: 'Employee user id — required when not using emailOrPhone' })
  @IsOptional()
  @IsUUID()
  employeeUserId?: string;

  @ApiPropertyOptional({ description: 'Email or phone of the employee — alternative to employeeUserId' })
  @ValidateIf((o: CreateEmploymentDto) => !o.employeeUserId)
  @IsString()
  @IsNotEmpty()
  emailOrPhone?: string;

  @ApiProperty({ enum: EmploymentTier, example: EmploymentTier.FULL })
  @IsEnum(EmploymentTier)
  tier: EmploymentTier;
}
