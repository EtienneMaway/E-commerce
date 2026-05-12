import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmployeeProfileDto {
  @ApiPropertyOptional({ example: 'Alice K.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ example: '1995-08-12', description: 'Date of birth (YYYY-MM-DD). Pass empty string to clear.' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Sales associate' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string;
}
