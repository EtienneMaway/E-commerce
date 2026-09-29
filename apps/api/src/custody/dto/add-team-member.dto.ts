import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddCustodyTeamMemberDto {
  @ApiProperty({
    example: 'uuid-v4',
    description:
      'The user allowed to sell from this volume: another employee of the business at this branch, or the owner themselves.',
  })
  @IsUUID()
  userId: string;
}
