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
import { CreateExternalEmployeeDto } from './dto/create-external-employee.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

@ApiTags('employments')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
@Controller('employments')
export class EmploymentsController {
  constructor(private readonly service: EmploymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Send an employment request to an existing user' })
  @ApiResponse({ status: 201, description: 'Employment created in PENDING status' })
  create(@CurrentUser() user: User, @Body() dto: CreateEmploymentDto) {
    return this.service.create(user.id, dto);
  }

  @Post('mini-employee')
  @ApiOperation({
    summary: 'Create a mini-employee account + active employment',
    description:
      'Returns a one-time pairing code shown to the employer. The employee uses this code on the mobile app to obtain a JWT. The code is not stored in plaintext.',
  })
  @ApiResponse({ status: 201, description: 'Mini employee created and immediately ACTIVE' })
  createMiniEmployee(@CurrentUser() user: User, @Body() dto: CreateMiniEmployeeDto) {
    return this.service.createMiniEmployee(user.id, dto);
  }

  @Post('external-employee')
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
  list(@CurrentUser() user: User, @Query() filter: EmploymentFilterDto) {
    return this.service.list(user.id, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one employment' })
  findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(user.id, id);
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
  @ApiOperation({ summary: 'Employer sets or clears the monthly pay target' })
  setSalary(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSalaryDto,
  ) {
    return this.service.setSalary(user.id, id, dto);
  }

  @Patch(':id/payroll-active')
  @ApiOperation({ summary: 'Employer pauses or resumes payroll for this employee' })
  setPayrollActive(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPayrollActiveDto,
  ) {
    return this.service.setPayrollActive(user.id, id, dto);
  }

  @Delete(':id/external')
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
  @ApiOperation({ summary: 'Employer edits the employee profile (name, date of birth, role)' })
  updateEmployeeProfile(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeProfileDto,
  ) {
    return this.service.updateEmployeeProfile(user.id, id, dto);
  }
}
