import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ExternalContactRole } from '../../entities';

export class CreateExternalContactDto {
  @ApiProperty({ example: 'Jean Dupont' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: '+243812345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Market vendor, pays on Fridays' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ enum: ExternalContactRole, example: ExternalContactRole.DEBTOR })
  @IsEnum(ExternalContactRole)
  role: ExternalContactRole;
}
