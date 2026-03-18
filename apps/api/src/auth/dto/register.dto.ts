import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'trader_alice' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiPropertyOptional({ example: 'alice@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Invalid phone number' })
  phone?: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  // At least one of email or phone must be provided
  @ValidateIf((o: RegisterDto) => !o.email && !o.phone)
  @IsString({ message: 'Provide at least one of email or phone' })
  _contactRequired?: never;
}
