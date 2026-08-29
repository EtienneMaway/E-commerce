import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class SetEmploymentRoleDto {
  @ApiPropertyOptional({
    example: 'uuid-v4',
    nullable: true,
    description:
      "The role to attach, or null to clear it. Clearing returns the employee to their tier's default access — which is wider than most roles, so it is an unrestricting action, not a restricting one.",
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  roleId?: string | null;
}
