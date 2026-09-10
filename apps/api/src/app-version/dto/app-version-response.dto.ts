import { ApiProperty } from '@nestjs/swagger';

export class ReleaseNotesDto {
  @ApiProperty({ example: 'Faster sales screen and printer fixes.' })
  readonly en!: string;

  @ApiProperty({ example: 'Écran des ventes plus rapide et corrections imprimante.' })
  readonly fr!: string;
}

export class AppVersionResponseDto {
  @ApiProperty({ enum: ['android', 'ios'], example: 'android' })
  readonly platform!: 'android' | 'ios';

  @ApiProperty({ example: '1.1.0' })
  readonly latestVersion!: string;

  @ApiProperty({ example: '1.0.0' })
  readonly minSupportedVersion!: string;

  @ApiProperty({
    nullable: true,
    example: 6,
    description: 'Newest build number on the store, when the server is configured with one.',
  })
  readonly latestBuild!: number | null;

  @ApiProperty({
    nullable: true,
    example: 'https://play.google.com/store/apps/details?id=com.kmb.mobile',
  })
  readonly storeUrl!: string | null;

  @ApiProperty({ type: ReleaseNotesDto, nullable: true })
  readonly releaseNotes!: ReleaseNotesDto | null;

  @ApiProperty({ example: true })
  readonly updateAvailable!: boolean;

  @ApiProperty({ example: false, description: 'Below the minimum supported version.' })
  readonly updateRequired!: boolean;
}
