import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Body for `PATCH /users/me/password` — strict self-service change: the real
 * current password only (no master fallback), and the new one must differ.
 * See `AuthChangePasswordDto` for the `/auth/password` variant.
 */
export class UserChangePasswordDto {
  @ApiProperty({ example: 'OldStrongPass123!' })
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty({ example: 'NewStrongPass123!' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
