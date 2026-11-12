import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Opt-in pagination for list endpoints that used to return everything.
 *
 * Backwards compatible on purpose: a request WITHOUT `page` gets the plain array
 * it always got, because mobile builds already in the field parse an array.
 * A request WITH `page` gets `{ data, pagination }`, the same envelope
 * `/sales`, `/expenses` and `/withdrawals` already use. New clients send `page`.
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PageQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Send to receive a paginated envelope instead of the full array' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: DEFAULT_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit?: number;
}

export interface PageInfo {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface Paginated<T> {
  readonly data: T[];
  readonly pagination: PageInfo;
}

export interface PageWindow {
  readonly page: number;
  readonly limit: number;
  readonly skip: number;
  readonly take: number;
}

/** The window to read, or `null` when the caller wants the legacy full array. */
export function pageWindow(q: { page?: number; limit?: number } | undefined): PageWindow | null {
  if (!q?.page) return null;
  const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return { page: q.page, limit, skip: (q.page - 1) * limit, take: limit };
}

export function toPaginated<T>(data: T[], total: number, w: PageWindow): Paginated<T> {
  return {
    data,
    pagination: { page: w.page, limit: w.limit, total, totalPages: Math.max(1, Math.ceil(total / w.limit)) },
  };
}
