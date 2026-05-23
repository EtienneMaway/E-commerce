import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'StrongPass123!',
    description: 'Current password — required to confirm the destructive action.',
  })
  @IsString()
  @MinLength(1)
  password: string;
}
