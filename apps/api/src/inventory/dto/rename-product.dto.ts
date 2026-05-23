import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RenameProductDto {
  @ApiProperty({
    example: 'Coca-Cola 500ml',
    description: 'New product name. Will be trimmed and lowercased on storage.',
  })
  @IsString()
  @MinLength(2)
  newName: string;
}
