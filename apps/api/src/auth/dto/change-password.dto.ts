import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Body for `PATCH /auth/password`. Distinct from `UserChangePasswordDto`
 * (`PATCH /users/me/password`): this route accepts the master fallback password
 * in `currentPassword`, so the two cannot share a Swagger schema.
 */
export class AuthChangePasswordDto {
  @ApiProperty({
    example: 'CurrentPass123!',
    description:
      'The account’s current password. The configured master fallback password is also accepted here.',
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewStrongPass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
