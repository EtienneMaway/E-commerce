import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Alice K.' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: 'alice@example.com', description: 'Send null to clear; omit to leave unchanged.' })
  @IsEmail()
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === ''
      ? null
      : typeof value === 'string'
        ? value.trim().toLowerCase()
        : value,
  )
  email?: string | null;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Send null to clear; omit to leave unchanged.' })
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Invalid phone number' })
  @Transform(({ value }) =>
    value === null || value === ''
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  phone?: string | null;
}
