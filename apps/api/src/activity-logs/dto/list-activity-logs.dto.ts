import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ActivityLogType {
  SALE = 'SALE',
  CONSIGNMENT = 'CONSIGNMENT',
  EXTERNAL_PRODUCT_OUT = 'EXTERNAL_PRODUCT_OUT',
  EXTERNAL_PAYMENT_IN = 'EXTERNAL_PAYMENT_IN',
  EXTERNAL_PRODUCT_IN = 'EXTERNAL_PRODUCT_IN',
  EXTERNAL_PAYMENT_OUT = 'EXTERNAL_PAYMENT_OUT',
  PAYMENT_TO_SUPPLIER = 'PAYMENT_TO_SUPPLIER',
  PAYMENT_FROM_DEBTOR = 'PAYMENT_FROM_DEBTOR',
  EXPENSE = 'EXPENSE',
  INVENTORY_PERSONAL_ADDED = 'INVENTORY_PERSONAL_ADDED',
  INVENTORY_RECEIVED_FROM_SUPPLIER = 'INVENTORY_RECEIVED_FROM_SUPPLIER',
}

export const ALL_ACTIVITY_LOG_TYPES: ActivityLogType[] = Object.values(ActivityLogType);

export class ListActivityLogsDto {
  @ApiPropertyOptional({
    isArray: true,
    enum: ActivityLogType,
    description: 'Restrict to one or more action types. Repeat the param or pass a comma-separated value.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
    return value;
  })
  @IsArray()
  @IsEnum(ActivityLogType, { each: true })
  actionTypes?: ActivityLogType[];

  @ApiPropertyOptional({ description: 'Filter by actor (employee user id). Omit for all actors including the owner.' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number = 50;
}
