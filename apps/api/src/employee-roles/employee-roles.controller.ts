import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EmployeeRolesService } from './employee-roles.service';
import { CreateEmployeeRoleDto } from './dto/create-employee-role.dto';
import { UpdateEmployeeRoleDto } from './dto/update-employee-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('employee-roles')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('employee-roles')
export class EmployeeRolesController {
  constructor(private readonly service: EmployeeRolesService) {}

  @Get('catalog')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'The catalogue of grantable services, with groups and role presets',
    description:
      'Static reference data for the role editor. Open to every tier so an employee can be shown what their own role covers. Labels are supplied by each client from its own i18n; this returns keys only.',
  })
  @ApiResponse({ status: 200, description: '{ groups, services, presets }' })
  getCatalog() {
    return this.service.getCatalog();
  }

  @Get()
  @AllowedFor('OWNER')
  @ApiOperation({ summary: "List the employer's roles, each with how many employees hold it" })
  @ApiResponse({ status: 200 })
  list(@CurrentActorContext() ctx: ActorContext) {
    return this.service.list(ctx.effectiveOwnerId);
  }

  @Get(':id')
  @AllowedFor('OWNER')
  @ApiOperation({ summary: 'Get one role' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  findOne(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(ctx.effectiveOwnerId, id);
  }

  @Post()
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Create a role',
    description:
      'Implied reads are expanded and stored, so the saved `services` list is exactly what the role grants. Assign it to an employee with PATCH /employments/:id/role.',
  })
  @ApiResponse({ status: 201, description: 'Role created' })
  @ApiResponse({ status: 409, description: 'You already have a role with that name' })
  create(@CurrentActorContext() ctx: ActorContext, @Body() dto: CreateEmployeeRoleDto) {
    return this.service.create(ctx.effectiveOwnerId, dto);
  }

  @Patch(':id')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Rename or re-scope a role',
    description:
      "Takes effect on the employee's next request — there is no cache and no re-login. Passing `services` replaces the list wholesale.",
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 409, description: 'You already have a role with that name' })
  update(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeRoleDto,
  ) {
    return this.service.update(ctx.effectiveOwnerId, id, dto);
  }

  @Delete(':id')
  @AllowedFor('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a role',
    description:
      'Refused while any open employment still holds it. Clearing a role means "tier defaults", which is wider than the role — so deletion must never silently widen someone\'s access.',
  })
  @ApiResponse({ status: 204, description: 'Role deleted' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 409, description: 'Role is still assigned to one or more employees' })
  remove(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(ctx.effectiveOwnerId, id);
  }
}
