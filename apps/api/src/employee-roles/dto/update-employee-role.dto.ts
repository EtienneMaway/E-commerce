import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeRoleDto } from './create-employee-role.dto';

/**
 * Every field optional — a rename and a re-scope are separate actions in the UI.
 * Passing `services` replaces the list wholesale; omitting it leaves it alone.
 */
export class UpdateEmployeeRoleDto extends PartialType(CreateEmployeeRoleDto) {}
