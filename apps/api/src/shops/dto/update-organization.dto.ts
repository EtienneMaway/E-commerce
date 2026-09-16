import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Amina Trading', description: 'Shown on receipts at every branch.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly name?: string;

  @ApiPropertyOptional({ example: 'A1234567B' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  readonly taxId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly logoUrl?: string;
}
