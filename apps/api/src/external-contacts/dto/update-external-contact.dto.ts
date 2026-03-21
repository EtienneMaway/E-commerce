import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ExternalContactRole } from '../../entities';

export class UpdateExternalContactDto {
  @ApiPropertyOptional({ example: 'Jean Dupont' })
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '+243812345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Market vendor, pays on Fridays' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ enum: ExternalContactRole })
  @IsEnum(ExternalContactRole)
  @IsOptional()
  role?: ExternalContactRole;
}
