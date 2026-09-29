import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, Equals, IsArray, IsBoolean, IsInt, IsUUID, Min } from 'class-validator';

export class ApproveSalesDto {
  @ApiProperty({ type: [String], description: 'The sales being attested to' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  saleIds: string[];

  @ApiProperty({
    example: 12,
    description:
      'How many sales the client believes it is approving. A mismatch is refused with 409 — a batch that grew since the screen was rendered must not be waved through unseen.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedCount: number;

  @ApiProperty({
    example: true,
    description:
      'The custodian states they actually went through the list. Must be literally true; the client shows the lines, the quantities and the total before it can be set.',
  })
  @IsBoolean()
  @Equals(true, { message: 'Confirm you have reviewed the sales before approving' })
  reviewed: boolean;
}
