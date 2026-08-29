import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Employment, EmploymentTier } from '../../entities';
import { resolveGrantedServices } from '../../common/services/service-catalog';

export class ActiveEmploymentDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['FULL', 'SALES_ONLY'] })
  tier: 'FULL' | 'SALES_ONLY';

  @ApiProperty({ enum: ['ACTIVE', 'TERMINATION_REQUESTED'] })
  status: 'ACTIVE' | 'TERMINATION_REQUESTED';

  @ApiProperty()
  employer: { id: string; username: string };

  @ApiPropertyOptional()
  terminationRequestedBy: string | null;

  @ApiPropertyOptional({
    description: 'The role the employer assigned, or null when none is set (the employee then has their tier\'s default access).',
  })
  role: { id: string; name: string } | null;

  @ApiProperty({
    type: [String],
    example: ['sales.record', 'inventory.view'],
    description:
      "Every service this employee currently holds — the role's list with implied reads expanded and anything above their tier ceiling removed, or the tier's defaults when no role is assigned. Always a concrete list, never null: clients test membership to decide what to show. The API enforces the same set regardless of what the client renders.",
  })
  services: string[];
}

/**
 * Single source for the `activeEmployment` payload. Both `AuthService.toPublic`
 * and `UsersService.toPublic` build the same object from the same query, so this
 * lives here rather than being written out twice and drifting.
 *
 * Note the services reflect the EMPLOYMENT, not the request's persona: a full
 * employee who is currently acting on their own books (`X-Acting-As: self`) is an
 * OWNER for that request and unrestricted. The clients hold the persona and apply
 * that themselves; the guard applies it per request.
 */
export function toActiveEmploymentDto(
  employment: Employment | null,
): ActiveEmploymentDto | null {
  if (!employment) return null;
  const tier =
    employment.tier === EmploymentTier.SALES_ONLY ? 'MINI_EMPLOYEE' : 'FULL_EMPLOYEE';
  return {
    id: employment.id,
    tier: employment.tier,
    status: employment.status as 'ACTIVE' | 'TERMINATION_REQUESTED',
    employer: { id: employment.employer.id, username: employment.employer.username },
    terminationRequestedBy: employment.terminationRequestedBy,
    role: employment.role ? { id: employment.role.id, name: employment.role.name } : null,
    services: [...resolveGrantedServices(employment.role?.services ?? null, tier)].sort(),
  };
}

export class UserPublicDto {
  @ApiProperty({ example: 'uuid-v4' })
  id: string;

  @ApiProperty({ example: 'trader_alice' })
  username: string;

  @ApiProperty({ example: 'alice@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: '+1234567890', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'Alice K.', nullable: true })
  name: string | null;

  @ApiPropertyOptional({ example: '1995-08-12', nullable: true })
  dateOfBirth: string | null;

  @ApiPropertyOptional({ example: 'Sales associate', nullable: true })
  role: string | null;

  @ApiProperty({ example: false })
  isMiniEmployee: boolean;

  @ApiProperty({ example: false })
  isExternalEmployee: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({
    type: ActiveEmploymentDto,
    nullable: true,
    description: 'Set when this user is currently an employee. The dashboard reads it to hide owner-only nav items and surface the "acting on behalf of" banner.',
  })
  activeEmployment: ActiveEmploymentDto | null;
}

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken: string;

  @ApiProperty({ type: UserPublicDto })
  user: UserPublicDto;
}
