import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldStrongPass123!' })
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty({ example: 'NewStrongPass123!' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
