import { ApiProperty } from '@nestjs/swagger';

export class PendingDeletionResponseDto {
  @ApiProperty({ example: true })
  pendingDeletion: true;

  @ApiProperty({ example: '2026-05-20T10:23:00.000Z' })
  deletedAt: string;

  @ApiProperty({ example: '2026-05-27T10:23:00.000Z', description: 'When the account will be permanently anonymized.' })
  expiresAt: string;
}
