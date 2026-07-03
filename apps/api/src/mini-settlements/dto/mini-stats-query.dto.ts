import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Period presets for the mini-employee home statistics.
 *  - since_handover (default): everything since the mini's last approved handover
 *    (their current, un-handed-over cycle) — no lower bound if they've never handed over.
 *  - today / week / month: rolling windows (calendar day / last 7 / last 30 days).
 *  - all: no lower bound (lifetime).
 */
export enum MiniStatsPeriod {
  SINCE_HANDOVER = 'since_handover',
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  ALL = 'all',
}

export class MiniStatsQueryDto {
  @ApiPropertyOptional({ enum: MiniStatsPeriod, default: MiniStatsPeriod.SINCE_HANDOVER })
  @IsEnum(MiniStatsPeriod)
  @IsOptional()
  period?: MiniStatsPeriod = MiniStatsPeriod.SINCE_HANDOVER;
}
