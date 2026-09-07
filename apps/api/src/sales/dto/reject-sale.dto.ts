import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectSaleDto {
  @ApiPropertyOptional({
    example: 'Wrong product handed over',
    description:
      'Why the sale is being rejected. Optional, but it is what the rejected-sales list and the handover report show.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  reason?: string;
}
