import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AppointCustodianDto {
  @ApiProperty({ example: 'uuid-v4', description: 'The full employee to make custodian of this branch' })
  @IsUUID()
  custodianId: string;

  @ApiPropertyOptional({
    example: true,
    description:
      "Also create an opening issue naming every unassigned lot at the branch, so the custodian takes over the shop's existing stock in one step. The issue is still PENDING — they must accept it.",
  })
  @IsOptional()
  @IsBoolean()
  sweepExistingStock?: boolean;

  @ApiPropertyOptional({ example: 'Morning shift, main counter' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
