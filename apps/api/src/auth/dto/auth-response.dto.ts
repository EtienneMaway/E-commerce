import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty({ example: false })
  isMiniEmployee: boolean;

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
