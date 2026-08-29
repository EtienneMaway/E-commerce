import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EmploymentsService } from './employments.service';
import { CreateEmploymentDto } from './dto/create-employment.dto';
import { CreateMiniEmployeeDto } from './dto/create-mini-employee.dto';
import { EmploymentFilterDto } from './dto/employment-filter.dto';
import { SetSalaryDto } from './dto/set-salary.dto';
import { SetPayrollActiveDto } from './dto/set-payroll-active.dto';
import { SetExpenseAllowanceDto } from './dto/set-expense-allowance.dto';
import { SetCommissionDto } from './dto/set-commission.dto';
import { CreateExternalEmployeeDto } from './dto/create-external-employee.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { SetEmploymentRoleDto } from '../employee-roles/dto/set-employment-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';
import { User } from '../entities';

@ApiTags('employments')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
@Controller('employments')
export class EmploymentsController {
  constructor(private readonly service: EmploymentsService) {}

  @Post()
  @RequiresService('employees.manage')
  @ApiOperation({ summary: 'Send an employment request to an existing user' })
  @ApiResponse({ status: 201, description: 'Employment created in PENDING status' })
  create(@CurrentUser() user: User, @Body() dto: CreateEmploymentDto) {
    return this.service.create(user.id, dto);
  }

  @Post('mini-employee')
  @RequiresService('employees.manage')
  @ApiOperation({
    summary: 'Create a mini-employee account + PENDING employment',
    description:
      'Returns a one-time pairing code shown to the employer. The employee uses this code on the mobile app to obtain a JWT, then accepts the invite (PATCH /employments/:id/accept) to activate. The code is not stored in plaintext.',
  })
  @ApiResponse({ status: 201, description: 'Mini employee created; employment is PENDING until the employee accepts on the app' })
  createMiniEmployee(@CurrentUser() user: User, @Body() dto: CreateMiniEmployeeDto) {
    return this.service.createMiniEmployee(user.id, dto);
  }

  @Post('external-employee')
  @RequiresService('employees.manage')
  @ApiOperation({
    summary: 'Create an external employee — payroll-only, no login',
    description:
      'Creates a User row that cannot authenticate, plus an immediately ACTIVE employment. Used to track salary for people who do not use the system.',
  })
  @ApiResponse({ status: 201, description: 'External employee created and immediately ACTIVE' })
  createExternalEmployee(@CurrentUser() user: User, @Body() dto: CreateExternalEmployeeDto) {
    return this.service.createExternalEmployee(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my employments (as employer or employee)' })
  list(
    @CurrentUser() user: User,
    @CurrentActorContext() ctx: ActorContext,
    @Query() filter: EmploymentFilterDto,
  ) {
    // ctx lets a supervisor (handovers.approve) also see their employer's minis.
    return this.service.list(user.id, filter, ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one employment' })
  findOne(
    @CurrentUser() user: User,
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.id, id, ctx);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Employee accepts a pending employment' })
  accept(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.accept(user.id, id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Employee rejects a pending employment' })
  reject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reject(user.id, id);
  }

  @Patch(':id/request-termination')
  @ApiOperation({ summary: 'Either party requests termination of an ACTIVE employment' })
  requestTermination(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.requestTermination(user.id, id);
  }

  @Patch(':id/approve-termination')
  @ApiOperation({ summary: 'Counterparty approves the pending termination request' })
  approveTermination(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveTermination(user.id, id);
  }

  @Patch(':id/cancel-termination')
  @ApiOperation({ summary: 'Initiator withdraws their termination request' })
  cancelTermination(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelTermination(user.id, id);
  }

  @Patch(':id/reject-termination')
  @ApiOperation({ summary: 'Counterparty refuses the pending termination request' })
  rejectTermination(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.rejectTermination(user.id, id);
  }

  @Patch(':id/salary')
  @RequiresService('employees.manage')
  @ApiOperation({ summary: 'Employer sets or clears the monthly pay target' })
  setSalary(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSalaryDto,
  ) {
    return this.service.setSalary(user.id, id, dto);
  }

  @Patch(':id/payroll-active')
  @RequiresService('employees.manage')
  @ApiOperation({ summary: 'Employer pauses or resumes payroll for this employee' })
  setPayrollActive(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPayrollActiveDto,
  ) {
    return this.service.setPayrollActive(user.id, id, dto);
  }

  @Patch(':id/expense-allowance')
  @RequiresService('employees.manage')
  @ApiOperation({
    summary: "Employer caps an employee's expenses at a share of what they sell",
    description:
      'At 5%, an employee who has sold 100 may claim up to 5 in expenses. For a mini employee the ' +
      'ceiling applies to the open handover cycle; for a full employee it applies per day (what they ' +
      'sold that day) and resets the next day. Always in force — set a high percentage to lift it.',
  })
  setExpenseAllowance(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetExpenseAllowanceDto,
  ) {
    return this.service.setExpenseAllowance(user.id, id, dto);
  }

  @Patch(':id/role')
  @AllowedFor('OWNER')
  @RequiresService('employees.manage')
  @ApiOperation({
    summary: "Employer sets or clears the employee's role",
    description:
      "The role decides which services the employee can use, on the dashboard and on mobile. Pass roleId: null to clear it — note that clearing WIDENS access back to the tier's defaults rather than removing it. Takes effect on the employee's next request.",
  })
  @ApiResponse({ status: 200, description: 'Employment updated' })
  @ApiResponse({ status: 400, description: 'Employment is closed' })
  @ApiResponse({ status: 403, description: 'Only the employer can set a role' })
  @ApiResponse({ status: 404, description: 'Employment or role not found' })
  setRole(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetEmploymentRoleDto,
  ) {
    return this.service.setRole(user.id, id, dto.roleId ?? null);
  }

  @Patch(':id/commission')
  @RequiresService('employees.manage')
  @ApiOperation({
    summary: "Employer sets a mini employee's commission on approved handovers",
    description:
      'The mini earns this percentage of the sold value of each handover approved from now on — the rate is ' +
      'sealed onto each handover at approval, so setting or changing it never rewrites past handovers. ' +
      'Send null to remove the commission. Can be combined with a monthly pay.',
  })
  setCommission(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCommissionDto,
  ) {
    return this.service.setCommission(user.id, id, dto);
  }

  @Delete(':id/external')
  @RequiresService('employees.manage')
  @ApiOperation({
    summary: 'Employer removes an external employee (one-step termination)',
    description:
      'Marks the employment as TERMINATED immediately. The user row and salary payment history are preserved for record-keeping. Allowed only when the employee is an external employee.',
  })
  removeExternalEmployee(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removeExternalEmployee(user.id, id);
  }

  @Patch(':id/profile')
  @RequiresService('employees.manage')
  @ApiOperation({ summary: 'Employer edits the employee profile (name, date of birth, role)' })
  updateEmployeeProfile(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeProfileDto,
  ) {
    return this.service.updateEmployeeProfile(user.id, id, dto);
  }
}
