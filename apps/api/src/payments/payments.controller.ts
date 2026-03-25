import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PaySupplierDto } from './dto/pay-supplier.dto';
import { RecordDebtorPaymentDto } from './dto/record-debtor-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

@ApiTags('payments')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('to-supplier')
  @ApiOperation({
    summary: 'Submit a payment to a supplier (creates as PENDING)',
    description:
      'Creates a PENDING payment. Balances are not updated until the supplier approves it.',
  })
  @ApiResponse({ status: 201, description: 'Payment created as PENDING' })
  @ApiResponse({ status: 404, description: 'No debt record found for this supplier' })
  paySupplier(@CurrentUser() user: User, @Body() dto: PaySupplierDto) {
    return this.paymentsService.paySupplier(user.id, dto);
  }

  @Get('pending-from-debtors')
  @ApiOperation({
    summary: 'List pending payments submitted by debtors to this supplier',
    description: 'Returns all PENDING payments where the current user is the recipient.',
  })
  @ApiResponse({ status: 200, description: 'Array of pending payments' })
  getPendingFromDebtors(@CurrentUser() user: User) {
    return this.paymentsService.getPendingFromDebtors(user.id);
  }

  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Approve a pending payment from a debtor',
    description:
      'Marks the payment as APPROVED and atomically deducts the amount from ' +
      "both the debtor's SupplierDebt and the supplier's DebtorCredit.",
  })
  @ApiResponse({ status: 200, description: 'Payment approved, balances updated' })
  @ApiResponse({ status: 404, description: 'Pending payment not found' })
  approvePayment(@CurrentUser() user: User, @Param('id') id: string) {
    return this.paymentsService.approvePayment(user.id, id);
  }

  @Patch(':id/reject')
  @ApiOperation({
    summary: 'Reject a pending payment from a debtor',
    description: 'Marks the payment as REJECTED. No balance changes are made.',
  })
  @ApiResponse({ status: 200, description: 'Payment rejected' })
  @ApiResponse({ status: 404, description: 'Pending payment not found' })
  rejectPayment(@CurrentUser() user: User, @Param('id') id: string) {
    return this.paymentsService.rejectPayment(user.id, id);
  }

  @Post('from-debtor')
  @ApiOperation({
    summary: 'Record a payment received directly from a debtor',
    description:
      'Immediately reduces the outstanding balance owed by the debtor (no approval needed — ' +
      'the supplier records this themselves).',
  })
  @ApiResponse({ status: 201, description: 'Payment recorded, balance updated' })
  @ApiResponse({ status: 404, description: 'No credit record found for this debtor' })
  recordDebtorPayment(@CurrentUser() user: User, @Body() dto: RecordDebtorPaymentDto) {
    return this.paymentsService.recordDebtorPayment(user.id, dto);
  }
}
