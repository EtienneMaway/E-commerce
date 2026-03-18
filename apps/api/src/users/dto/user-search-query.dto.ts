import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UserSearchQueryDto {
  @ApiProperty({ example: 'alice', description: 'Min 2 characters' })
  @IsString()
  @MinLength(2, { message: 'Search query must be at least 2 characters' })
  q: string;
}
