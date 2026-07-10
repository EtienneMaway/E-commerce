import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RenameGroupDto {
  @ApiProperty({ example: 'cocotte', description: 'New group name — stored lowercase, unique per owner' })
  @IsString()
  @MinLength(2)
  newName: string;
}
