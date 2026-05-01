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
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

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
  getSummary(@CurrentActorContext() ctx: ActorContext) {
    return this.dashboardService.getSummary(ctx.effectiveOwnerId);
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
  getCashPosition(@CurrentActorContext() ctx: ActorContext) {
    return this.dashboardService.getCashPosition(ctx.effectiveOwnerId);
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'List all suppliers with outstanding balances' })
  @ApiResponse({ status: 200, description: 'Supplier list sorted by balance desc' })
  getSuppliers(@CurrentActorContext() ctx: ActorContext) {
    return this.dashboardService.getSuppliers(ctx.effectiveOwnerId);
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
    @CurrentActorContext() ctx: ActorContext,
    @Param('supplierUserId', ParseUUIDPipe) supplierUserId: string,
  ) {
    return this.dashboardService.getSupplierDetail(ctx.effectiveOwnerId, supplierUserId);
  }

  @Get('debtors')
  @ApiOperation({ summary: 'List all debtors with outstanding balances' })
  @ApiResponse({ status: 200, description: 'Debtor list sorted by balance desc' })
  getDebtors(@CurrentActorContext() ctx: ActorContext) {
    return this.dashboardService.getDebtors(ctx.effectiveOwnerId);
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
    @CurrentActorContext() ctx: ActorContext,
    @Param('debtorUserId', ParseUUIDPipe) debtorUserId: string,
  ) {
    return this.dashboardService.getDebtorDetail(ctx.effectiveOwnerId, debtorUserId);
  }

  @Get('profit-by-product')
  @ApiOperation({ summary: 'Profit breakdown per product (all time)' })
  @ApiResponse({ status: 200, description: 'Products sorted by total profit desc' })
  getProfitByProduct(@CurrentActorContext() ctx: ActorContext) {
    return this.dashboardService.getProfitByProduct(ctx.effectiveOwnerId);
  }

  @Get('profit-by-source')
  @ApiOperation({
    summary: 'Profit split by stock source (personal vs each supplier)',
  })
  @ApiResponse({ status: 200, description: 'Sources sorted by total profit desc' })
  getProfitBySource(@CurrentActorContext() ctx: ActorContext) {
    return this.dashboardService.getProfitBySource(ctx.effectiveOwnerId);
  }

  @Get('alerts')
  @ApiOperation({
    summary: 'Business alerts — overdue debtors and low-stock items',
    description:
      `Returns overdue debtors (outstanding balance with no payment in ${30}+ days) ` +
      `and low-stock inventory entries (quantityRemaining ≤ ${5}).`,
  })
  @ApiResponse({ status: 200, description: 'Array of AlertItem objects' })
  getAlerts(@CurrentActorContext() ctx: ActorContext) {
    return this.dashboardService.getAlerts(ctx.effectiveOwnerId);
  }
}
