import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustodyHandoverDto {
  @ApiProperty({
    example: '405000.0000',
    description: 'FC the custodian is actually handing over. What the books expected is computed, not sent.',
  })
  @IsDecimal({ decimal_digits: '1,4' })
  cashDeclaredFc: string;

  @ApiPropertyOptional({ example: 'Two clients still owe for Friday' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
