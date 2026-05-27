import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateSaleClientDto {
  @ApiPropertyOptional({ example: 'Jean Mukendi' })
  @IsString()
  @IsOptional()
  clientName?: string;

  @ApiPropertyOptional({ example: '+243 836 743 579' })
  @IsString()
  @IsOptional()
  clientPhone?: string;
}
