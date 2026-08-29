import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ALL_SERVICE_KEYS, ServiceKey } from '../../common/services/service-catalog';

export class CreateEmployeeRoleDto {
  @ApiProperty({ example: 'Cashier', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    example: 'Sells and records expenses, no access to money screens',
    maxLength: 240,
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @ApiProperty({
    description:
      'Catalogue service keys (see GET /employee-roles/catalog). An empty array is legal: the employee keeps only login, their own salary, and the right to leave the job. Implied reads are added server-side, and anything above the employee tier ceiling is dropped at request time.',
    example: ['sales.record', 'sales.history', 'expenses.record'],
    enum: ALL_SERVICE_KEYS,
    isArray: true,
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_SERVICE_KEYS as readonly string[], { each: true })
  services: ServiceKey[];
}
