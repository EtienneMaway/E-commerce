import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AddPersonalDto } from './dto/add-personal.dto';
import { AddPersonalBulkDto } from './dto/add-personal-bulk.dto';
import { ReceiveFromSupplierDto } from './dto/receive-from-supplier.dto';
import { ConsignToDebtorDto } from './dto/consign-to-debtor.dto';
import { InventoryFilterDto } from './dto/inventory-filter.dto';
import { UpdateSellingPriceDto } from './dto/update-selling-price.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { RenameProductDto } from './dto/rename-product.dto';
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
  // Minis operate on their own books (effectiveOwnerId = own id) and must be
  // able to browse their consigned-in stock to sell/re-price it.
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({ summary: 'Get aggregated product list — one entry per unique product name' })
  @ApiResponse({ status: 200, description: 'Array of ProductSummary objects' })
  getProducts(@CurrentActorContext() ctx: ActorContext) {
    return this.inventoryService.getProductList(ctx.effectiveOwnerId);
  }

  @Get()
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
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

  @Post('personal/bulk')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Add multiple personal products in one atomic transaction (owner only)',
    description:
      'Creates or upserts inventory entries for each item in a single DB transaction. ' +
      'If any item fails validation or persistence, the whole batch is rolled back.',
  })
  @ApiResponse({ status: 201, description: 'Array of inventory entries created/updated' })
  addPersonalBulk(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: AddPersonalBulkDto,
  ) {
    return this.inventoryService.addPersonalBulk(ctx.effectiveOwnerId, dto);
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

  @Patch('products/:name/rename')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Rename a product, cascading the new name across all owner-scoped tables (owner only)',
    description:
      'Atomically renames a product across inventory_entries (PERSONAL+SUPPLIER only), sale_transactions, ' +
      'external_transactions, and product_prices. Blocked when the product has CONSIGNED_IN or ' +
      'CONSIGNED_OUT stock (names must stay in sync with the counterparty). Blocked when another ' +
      'product already uses the new name on this owner\'s books.',
  })
  @ApiResponse({ status: 200, description: 'Rename summary with per-table update counts' })
  @ApiResponse({ status: 400, description: 'Product has consignment-linked stock' })
  @ApiResponse({ status: 404, description: 'No owner-controlled stock for that product name' })
  @ApiResponse({ status: 409, description: 'Another product already uses the new name' })
  renameProduct(
    @CurrentActorContext() ctx: ActorContext,
    @Param('name') name: string,
    @Body() dto: RenameProductDto,
  ) {
    return this.inventoryService.renameProduct(ctx.effectiveOwnerId, name, dto);
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

  @Patch(':id/mini-selling-price')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Mini employee raises the selling price on their own consigned-in stock',
    description:
      'Mini-employee only. The new price must be at or above the agreed price they owe (the entry unit cost); the markup above it is the mini\'s profit.',
  })
  @ApiResponse({ status: 200, description: 'Selling price updated' })
  @ApiResponse({ status: 400, description: 'Entry is not CONSIGNED_IN, or price below the agreed price' })
  @ApiResponse({ status: 403, description: 'Entry does not belong to you' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  updateMiniSellingPrice(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateSellingPriceDto,
  ) {
    return this.inventoryService.updateMiniSellingPrice(ctx.effectiveOwnerId, id, dto);
  }

  @Post(':entryId/adjust')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Manually adjust stock for an inventory entry with a typed reason (owner only)',
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
