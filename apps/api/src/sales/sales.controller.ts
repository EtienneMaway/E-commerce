import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { RecordSaleDto } from './dto/record-sale.dto';
import { SalesFilterDto, TopProductsFilterDto } from './dto/sales-filter.dto';
import { PriceGuardWarningDto } from './dto/price-guard-warning.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('sales')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Record a sale',
    description:
      'Enforces price guard (returns 422 if selling at/below cost) and ' +
      'stock priority (SUPPLIER stock deducted before PERSONAL). ' +
      'Send confirmedOverride: true to bypass the price guard after receiving the warning. ' +
      'For employees: returns 422 DISCOUNT_REASON_REQUIRED if submitted price is below owner\'s standard, requiring discountReason on retry. ' +
      'Submitting above standard is silently capped to standard.',
  })
  @ApiResponse({ status: 201, description: 'Sale recorded successfully' })
  @ApiResponse({
    status: 422,
    type: PriceGuardWarningDto,
    description: 'Price guard or discount-reason warning',
  })
  @ApiResponse({ status: 400, description: 'Insufficient stock or product not found' })
  recordSale(@CurrentActorContext() ctx: ActorContext, @Body() dto: RecordSaleDto) {
    return this.salesService.recordSale(ctx, dto);
  }

  @Get()
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({ summary: 'List sales history with optional filters' })
  @ApiResponse({ status: 200, description: 'Paginated sales list with total count' })
  findAll(@CurrentActorContext() ctx: ActorContext, @Query() filter: SalesFilterDto) {
    return this.salesService.findAll(ctx, filter);
  }

  @Get('top-products')
  @ApiOperation({
    summary: 'Get top sold products ranked by quantity, revenue, or profit',
  })
  @ApiResponse({ status: 200, description: 'Ranked product list' })
  topProducts(@CurrentActorContext() ctx: ActorContext, @Query() filter: TopProductsFilterDto) {
    return this.salesService.topProducts(ctx, filter);
  }
}
