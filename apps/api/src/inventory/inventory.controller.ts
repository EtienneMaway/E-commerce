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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

@ApiTags('inventory')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'List all inventory entries for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Array of inventory entries' })
  findAll(@CurrentUser() user: User, @Query() filter: InventoryFilterDto) {
    return this.inventoryService.findAll(user.id, filter);
  }

  @Post('personal')
  @ApiOperation({ summary: 'Add a product purchased with personal funds' })
  @ApiResponse({ status: 201, description: 'Inventory entry created' })
  addPersonal(@CurrentUser() user: User, @Body() dto: AddPersonalDto) {
    return this.inventoryService.addPersonal(user.id, dto);
  }

  @Post('receive')
  @ApiOperation({
    summary: 'Receive product from a supplier on credit',
    description:
      'Creates an inventory entry (source: SUPPLIER) and increases the debt owed to that supplier.',
  })
  @ApiResponse({ status: 201, description: 'Entry created, supplier debt updated' })
  @ApiResponse({ status: 404, description: 'Supplier user not found' })
  receiveFromSupplier(
    @CurrentUser() user: User,
    @Body() dto: ReceiveFromSupplierDto,
  ) {
    return this.inventoryService.receiveFromSupplier(user.id, dto);
  }

  @Patch(':id/selling-price')
  @ApiOperation({
    summary: 'Update selling price on a CONSIGNED_IN inventory entry',
    description: 'Allows a debtor to set their own selling price on goods received via consignment.',
  })
  @ApiResponse({ status: 200, description: 'Selling price updated' })
  @ApiResponse({ status: 400, description: 'Entry is not CONSIGNED_IN' })
  @ApiResponse({ status: 403, description: 'Entry does not belong to you' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  updateSellingPrice(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateSellingPriceDto,
  ) {
    return this.inventoryService.updateSellingPrice(user.id, id, dto);
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
  consignToDebtor(@CurrentUser() user: User, @Body() dto: ConsignToDebtorDto) {
    return this.inventoryService.consignToDebtor(user.id, dto);
  }
}
