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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

@ApiTags('sales')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @ApiOperation({
    summary: 'Record a sale',
    description:
      'Enforces price guard (returns 422 if selling at/below cost) and ' +
      'stock priority (SUPPLIER stock deducted before PERSONAL). ' +
      'Send confirmedOverride: true to bypass the price guard after receiving the warning.',
  })
  @ApiResponse({ status: 201, description: 'Sale recorded successfully' })
  @ApiResponse({
    status: 422,
    type: PriceGuardWarningDto,
    description: 'Price guard warning — selling at or below cost',
  })
  @ApiResponse({ status: 400, description: 'Insufficient stock or product not found' })
  recordSale(@CurrentUser() user: User, @Body() dto: RecordSaleDto) {
    return this.salesService.recordSale(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List sales history with optional filters' })
  @ApiResponse({ status: 200, description: 'Paginated sales list with total count' })
  findAll(@CurrentUser() user: User, @Query() filter: SalesFilterDto) {
    return this.salesService.findAll(user.id, filter);
  }

  @Get('top-products')
  @ApiOperation({
    summary: 'Get top sold products ranked by quantity, revenue, or profit',
  })
  @ApiResponse({ status: 200, description: 'Ranked product list' })
  topProducts(@CurrentUser() user: User, @Query() filter: TopProductsFilterDto) {
    return this.salesService.topProducts(user.id, filter);
  }
}
