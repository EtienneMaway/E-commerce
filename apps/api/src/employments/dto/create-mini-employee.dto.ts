import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMiniEmployeeDto {
  @ApiProperty({ example: 'Alice K.', description: 'Display name shown next to actions in logs' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(64)
  name: string;

  @ApiPropertyOptional({ example: '+243990000000' })
  @IsOptional()
  @IsString()
  phone?: string;
}
