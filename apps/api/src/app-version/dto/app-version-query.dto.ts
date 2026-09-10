import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';
import type { MobilePlatform } from '../app-version.service';

export class AppVersionQueryDto {
  @ApiPropertyOptional({ enum: ['android', 'ios'], example: 'android' })
  @IsOptional()
  @IsEnum(['android', 'ios'] as const)
  readonly platform?: MobilePlatform;

  @ApiPropertyOptional({
    description: 'Version currently installed on the device.',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9]+(\.[0-9]+)*([-+][A-Za-z0-9.-]+)?$/, {
    message: 'version must look like 1.2.3',
  })
  readonly version?: string;

  @ApiPropertyOptional({
    description:
      'Android versionCode / iOS build number installed on the device. EAS bumps this on every build, so it catches a release where the version name was not changed.',
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  readonly build?: number;
}
