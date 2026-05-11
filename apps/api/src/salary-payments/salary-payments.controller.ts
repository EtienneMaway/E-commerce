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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';
import { SalaryPaymentsService } from './salary-payments.service';
import { CreateSalaryPaymentDto } from './dto/create-salary-payment.dto';
import { ListSalaryPaymentsDto } from './dto/list-salary-payments.dto';
import { RejectSalaryPaymentDto } from './dto/reject-salary-payment.dto';
import { SalarySummaryQueryDto } from './dto/salary-summary-query.dto';

@ApiTags('salary-payments')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
@Controller('salary-payments')
export class SalaryPaymentsController {
  constructor(private readonly service: SalaryPaymentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Employer records a salary payment (full or installment)',
    description:
      'Created in PENDING_CONFIRMATION status — only counts toward the salary budget once the employee confirms receipt.',
  })
  @ApiResponse({ status: 422, description: 'Payment exceeds the monthly target — re-submit with confirmedOverride: true to proceed.' })
  create(@CurrentUser() user: User, @Body() dto: CreateSalaryPaymentDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List salary payments (employer or employee perspective)' })
  list(@CurrentUser() user: User, @Query() filter: ListSalaryPaymentsDto) {
    return this.service.list(user.id, filter);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Pending salary payments awaiting my confirmation (employee)' })
  pending(@CurrentUser() user: User) {
    return this.service.pendingForEmployee(user.id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Salary summary for an employment + period' })
  summary(@CurrentUser() user: User, @Query() query: SalarySummaryQueryDto) {
    return this.service.summary(user.id, query);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Employee confirms cash receipt — payment counts toward salary paid' })
  confirm(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.confirm(user.id, id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Employee disputes the payment (cash never received)' })
  reject(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSalaryPaymentDto,
  ) {
    return this.service.reject(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Employer cancels a pending payment they recorded by mistake' })
  cancel(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(user.id, id);
  }
}
