import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

@ApiTags('dashboard')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Financial summary dashboard',
    description:
      'Returns totalIOwe, totalOwedToMe, netPosition, and totalProfitAllTime.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard summary' })
  getSummary(@CurrentUser() user: User) {
    return this.dashboardService.getSummary(user.id);
  }

  @Get('cash-position')
  @ApiOperation({
    summary: 'Cash position overview',
    description:
      'Returns total income (direct sales + accepted consignments + external product-out), ' +
      'COGS, total profit, total expenses (USD), and available cash ready for restock. ' +
      'Available cash may be negative when expenses exceed profit.',
  })
  @ApiResponse({ status: 200, description: 'Cash position summary' })
  getCashPosition(@CurrentUser() user: User) {
    return this.dashboardService.getCashPosition(user.id);
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'List all suppliers with outstanding balances' })
  @ApiResponse({ status: 200, description: 'Supplier list sorted by balance desc' })
  getSuppliers(@CurrentUser() user: User) {
    return this.dashboardService.getSuppliers(user.id);
  }

  @Get('suppliers/:supplierUserId')
  @ApiOperation({
    summary: 'Supplier detail view',
    description:
      'Products received, total sold value, outstanding debt, full payment history with running balance.',
  })
  @ApiParam({ name: 'supplierUserId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Supplier detail' })
  @ApiResponse({ status: 404, description: 'No relationship found' })
  getSupplierDetail(
    @CurrentUser() user: User,
    @Param('supplierUserId', ParseUUIDPipe) supplierUserId: string,
  ) {
    return this.dashboardService.getSupplierDetail(user.id, supplierUserId);
  }

  @Get('debtors')
  @ApiOperation({ summary: 'List all debtors with outstanding balances' })
  @ApiResponse({ status: 200, description: 'Debtor list sorted by balance desc' })
  getDebtors(@CurrentUser() user: User) {
    return this.dashboardService.getDebtors(user.id);
  }

  @Get('debtors/:debtorUserId')
  @ApiOperation({
    summary: 'Debtor detail view',
    description:
      'Products consigned, outstanding balance, full payment history with running balance.',
  })
  @ApiParam({ name: 'debtorUserId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Debtor detail' })
  @ApiResponse({ status: 404, description: 'No relationship found' })
  getDebtorDetail(
    @CurrentUser() user: User,
    @Param('debtorUserId', ParseUUIDPipe) debtorUserId: string,
  ) {
    return this.dashboardService.getDebtorDetail(user.id, debtorUserId);
  }

  @Get('profit-by-product')
  @ApiOperation({ summary: 'Profit breakdown per product (all time)' })
  @ApiResponse({ status: 200, description: 'Products sorted by total profit desc' })
  getProfitByProduct(@CurrentUser() user: User) {
    return this.dashboardService.getProfitByProduct(user.id);
  }

  @Get('profit-by-source')
  @ApiOperation({
    summary: 'Profit split by stock source (personal vs each supplier)',
  })
  @ApiResponse({ status: 200, description: 'Sources sorted by total profit desc' })
  getProfitBySource(@CurrentUser() user: User) {
    return this.dashboardService.getProfitBySource(user.id);
  }

  @Get('alerts')
  @ApiOperation({
    summary: 'Business alerts — overdue debtors and low-stock items',
    description:
      `Returns overdue debtors (outstanding balance with no payment in ${30}+ days) ` +
      `and low-stock inventory entries (quantityRemaining ≤ ${5}).`,
  })
  @ApiResponse({ status: 200, description: 'Array of AlertItem objects' })
  getAlerts(@CurrentUser() user: User) {
    return this.dashboardService.getAlerts(user.id);
  }
}
