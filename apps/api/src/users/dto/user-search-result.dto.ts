import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserSearchResultDto {
  @ApiProperty({ example: 'uuid-v4' })
  id: string;

  @ApiProperty({ example: 'trader_alice' })
  username: string;

  @ApiPropertyOptional({ example: 'alice@example.com' })
  email: string | null;

  @ApiPropertyOptional({ example: '+1234567890' })
  phone: string | null;
}
