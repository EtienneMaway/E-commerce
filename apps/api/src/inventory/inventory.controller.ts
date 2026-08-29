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
import { UpdateMiniCartonPriceDto } from './dto/update-mini-carton-price.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('inventory')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('products')
  @RequiresService('inventory.view')
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
  @RequiresService('inventory.view')
  @ApiOperation({ summary: 'List all inventory entries for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Array of inventory entries' })
  findAll(@CurrentActorContext() ctx: ActorContext, @Query() filter: InventoryFilterDto) {
    return this.inventoryService.findAll(ctx.effectiveOwnerId, filter);
  }

  @Post('personal')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @RequiresService('inventory.add_personal')
  @ApiOperation({ summary: 'Add a product purchased with personal funds (owner, or an employee whose role grants it)' })
  @ApiResponse({ status: 201, description: 'Inventory entry created' })
  addPersonal(@CurrentActorContext() ctx: ActorContext, @Body() dto: AddPersonalDto) {
    return this.inventoryService.addPersonal(ctx.effectiveOwnerId, dto);
  }

  @Post('personal/bulk')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @RequiresService('inventory.add_personal')
  @ApiOperation({
    summary: 'Add multiple personal products in one atomic transaction (owner, or an employee whose role grants it)',
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
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @RequiresService('inventory.receive')
  @ApiOperation({
    summary: 'Receive product from a supplier on credit (owner, or an employee whose role grants it)',
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
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @RequiresService('products.manage')
  @ApiOperation({
    summary: 'Rename a product, cascading the new name across all owner-scoped tables (owner, or an employee whose role grants it)',
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
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @RequiresService('inventory.price')
  @ApiOperation({
    summary: 'Update selling price on an inventory entry (owner, or an employee whose role grants it)',
    description:
      'Not open to employees by default because changing a product\'s standard price affects all ' +
      'subsequent sales; an employer can delegate it with the `inventory.price` service — ' +
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
  @RequiresService('inventory.price')
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

  @Patch('mini-carton-price')
  @AllowedFor('MINI_EMPLOYEE')
  @RequiresService('inventory.price')
  @ApiOperation({
    summary: 'Mini employee sets the whole-carton selling price for a sized product',
    description:
      'Stores the price on the mini\'s consigned-in lots so the app defaults to it when selling a carton. Floor enforced by the sale price guard.',
  })
  @ApiResponse({ status: 200, description: '{ updated }' })
  @ApiResponse({ status: 404, description: 'No consigned stock for this product' })
  updateMiniCartonPrice(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: UpdateMiniCartonPriceDto,
  ) {
    return this.inventoryService.updateMiniCartonPrice(
      ctx.effectiveOwnerId,
      dto.groupId,
      dto.cartonSellingPrice,
    );
  }

  @Post(':entryId/adjust')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @RequiresService('inventory.adjust')
  @ApiOperation({
    summary: 'Manually adjust stock for an inventory entry with a typed reason (owner, or an employee whose role grants it)',
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

  @Post('variant/:variantId/adjust')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @RequiresService('inventory.adjust')
  @ApiOperation({
    summary: 'Adjust stock for one size of a sized product with a typed reason (owner, or an employee whose role grants it)',
    description:
      'Finds the owner\'s own lot for the size (PERSONAL first, else SUPPLIER) and applies the ' +
      'same typed adjustment as POST /inventory/:entryId/adjust.',
  })
  @ApiResponse({ status: 201, description: '{ entry, movement }' })
  @ApiResponse({ status: 400, description: 'Invalid reason / insufficient stock / missing notes' })
  @ApiResponse({ status: 404, description: 'No adjustable stock for this size' })
  adjustVariantStock(
    @CurrentActorContext() ctx: ActorContext,
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustVariantStock(ctx.effectiveOwnerId, variantId, dto);
  }

  @Post('consign')
  @RequiresService('consignments.send')
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
