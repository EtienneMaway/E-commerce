import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateShopDto {
  @ApiProperty({ example: 'Kasa-Vubu branch' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  readonly name!: string;

  @ApiPropertyOptional({ example: 'Avenue Kasa-Vubu 42' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly address?: string;

  @ApiPropertyOptional({ example: '+243 990 000 000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  readonly phone?: string;

  @ApiPropertyOptional({ example: 'Goma' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  readonly city?: string;

  @ApiPropertyOptional({ example: 'Opposite the market' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly note?: string;

  @ApiPropertyOptional({ description: 'Printed above the receipt body.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly receiptHeader?: string;

  @ApiPropertyOptional({ description: 'Printed below the receipt body.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly receiptFooter?: string;
}
