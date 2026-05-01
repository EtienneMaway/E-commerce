import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AddPersonalDto } from './dto/add-personal.dto';
import { ReceiveFromSupplierDto } from './dto/receive-from-supplier.dto';
import { ConsignToDebtorDto } from './dto/consign-to-debtor.dto';
import { InventoryFilterDto } from './dto/inventory-filter.dto';
import { UpdateSellingPriceDto } from './dto/update-selling-price.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('inventory')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('products')
  @ApiOperation({ summary: 'Get aggregated product list — one entry per unique product name' })
  @ApiResponse({ status: 200, description: 'Array of ProductSummary objects' })
  getProducts(@CurrentActorContext() ctx: ActorContext) {
    return this.inventoryService.getProductList(ctx.effectiveOwnerId);
  }

  @Get()
  @ApiOperation({ summary: 'List all inventory entries for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Array of inventory entries' })
  findAll(@CurrentActorContext() ctx: ActorContext, @Query() filter: InventoryFilterDto) {
    return this.inventoryService.findAll(ctx.effectiveOwnerId, filter);
  }

  @Post('personal')
  @AllowedFor('OWNER')
  @ApiOperation({ summary: 'Add a product purchased with personal funds (owner only)' })
  @ApiResponse({ status: 201, description: 'Inventory entry created' })
  addPersonal(@CurrentActorContext() ctx: ActorContext, @Body() dto: AddPersonalDto) {
    return this.inventoryService.addPersonal(ctx.effectiveOwnerId, dto);
  }

  @Post('receive')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Receive product from a supplier on credit (owner only)',
    description:
      'Creates an inventory entry (source: SUPPLIER) and increases the debt owed to that supplier.',
  })
  @ApiResponse({ status: 201, description: 'Entry created, supplier debt updated' })
  @ApiResponse({ status: 404, description: 'Supplier user not found' })
  receiveFromSupplier(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: ReceiveFromSupplierDto,
  ) {
    return this.inventoryService.receiveFromSupplier(ctx.effectiveOwnerId, dto);
  }

  @Patch(':id/selling-price')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Update selling price on an inventory entry (owner only)',
    description:
      'Owner-only because changing a product\'s standard price affects all subsequent sales — ' +
      'employees use per-transaction discountReason instead.',
  })
  @ApiResponse({ status: 200, description: 'Selling price updated' })
  @ApiResponse({ status: 400, description: 'Entry is not CONSIGNED_IN' })
  @ApiResponse({ status: 403, description: 'Entry does not belong to you' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  updateSellingPrice(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateSellingPriceDto,
  ) {
    return this.inventoryService.updateSellingPrice(ctx.effectiveOwnerId, id, dto);
  }

  @Post(':entryId/adjust')
  @ApiOperation({
    summary: 'Manually adjust stock for an inventory entry with a typed reason',
    description:
      'Records a stock movement (audit ledger) and updates quantity_remaining. ' +
      'SUPPLIER_RETURN also reduces the linked supplier debt. ' +
      'Notes are required for RECOUNT_UP, RECOUNT_DOWN, OTHER_IN, OTHER_OUT.',
  })
  @ApiResponse({ status: 201, description: '{ entry, movement }' })
  @ApiResponse({ status: 400, description: 'Invalid reason / source mismatch / insufficient stock / missing notes' })
  @ApiResponse({ status: 403, description: 'Entry does not belong to you' })
  @ApiResponse({ status: 404, description: 'Inventory entry not found' })
  adjustStock(
    @CurrentActorContext() ctx: ActorContext,
    @Param('entryId') entryId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(ctx.effectiveOwnerId, entryId, dto);
  }

  @Post('consign')
  @ApiOperation({
    summary: 'Consign a product to a debtor on credit',
    description:
      'Deducts stock from owner inventory (SUPPLIER first), creates CONSIGNED_OUT entry, and increases the debtor\'s outstanding balance.',
  })
  @ApiResponse({ status: 201, description: 'Entry created, debtor credit updated' })
  @ApiResponse({ status: 400, description: 'Insufficient stock' })
  @ApiResponse({ status: 404, description: 'Debtor user not found' })
  consignToDebtor(@CurrentActorContext() ctx: ActorContext, @Body() dto: ConsignToDebtorDto) {
    return this.inventoryService.consignToDebtor(ctx.effectiveOwnerId, dto);
  }
}
