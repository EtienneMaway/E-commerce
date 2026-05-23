import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddPersonalDto } from './add-personal.dto';

export class AddPersonalBulkDto {
  @ApiProperty({
    type: [AddPersonalDto],
    description: 'Products to add in a single atomic transaction',
  })
  @ValidateNested({ each: true })
  @Type(() => AddPersonalDto)
  @ArrayMinSize(1)
  items: AddPersonalDto[];
}
