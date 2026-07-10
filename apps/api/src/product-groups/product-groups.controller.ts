import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ProductGroupsService } from './product-groups.service';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { AddGroupStockDto } from './dto/add-group-stock.dto';
import { RenameGroupDto } from './dto/rename-group.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('product-groups')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('product-groups')
export class ProductGroupsController {
  constructor(private readonly service: ProductGroupsService) {}

  @Get()
  // Minis browse their consigned-in sized stock to sell/re-price it, so reads
  // must allow MINI_EMPLOYEE (default allowlist would 403 them).
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'List sized product groups with per-size availability',
  })
  @ApiResponse({ status: 200, description: 'Array of GroupWithAvailability' })
  list(@CurrentActorContext() ctx: ActorContext) {
    return this.service.listGroups(ctx.effectiveOwnerId);
  }

  @Get(':id')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Get one sized product group with per-size availability',
  })
  @ApiResponse({ status: 200, description: 'GroupWithAvailability' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  get(@CurrentActorContext() ctx: ActorContext, @Param('id') id: string) {
    return this.service.getGroup(ctx.effectiveOwnerId, id);
  }

  @Post()
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Create a sized product group with its sizes (owner only)',
  })
  @ApiResponse({ status: 201, description: 'Group created' })
  @ApiResponse({
    status: 409,
    description: 'A product with this name already exists',
  })
  create(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: CreateProductGroupDto,
  ) {
    return this.service.createGroup(ctx.effectiveOwnerId, dto);
  }

  @Patch(':id')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary:
      'Update a group (category, carton price, archive). Renaming is Phase 6.',
  })
  @ApiResponse({ status: 200, description: 'Group updated' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  update(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductGroupDto,
  ) {
    return this.service.updateGroup(ctx.effectiveOwnerId, id, dto);
  }

  @Patch(':id/rename')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Rename a group, cascading across its stock + sales (owner only)',
    description:
      'Atomically renames the group and cascades the new name across the owner\'s ' +
      'PERSONAL/SUPPLIER lots and their sale rows. Blocked while active consigned stock exists.',
  })
  @ApiResponse({ status: 200, description: 'Rename summary with per-table counts' })
  @ApiResponse({ status: 400, description: 'Group has active consigned stock' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  @ApiResponse({ status: 409, description: 'Another product already uses the new name' })
  rename(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: RenameGroupDto,
  ) {
    return this.service.renameGroup(ctx.effectiveOwnerId, id, dto.newName);
  }

  @Post(':id/variants')
  @AllowedFor('OWNER')
  @ApiOperation({ summary: 'Add a size to an existing group (owner only)' })
  @ApiResponse({ status: 201, description: 'Size added' })
  @ApiResponse({
    status: 409,
    description: 'A size with this label already exists',
  })
  addVariant(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.service.addVariant(ctx.effectiveOwnerId, id, dto);
  }

  @Patch(':id/variants/:variantId')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Edit a size (cost, price, pieces/carton, label) (owner only)',
  })
  @ApiResponse({ status: 200, description: 'Size updated' })
  @ApiResponse({ status: 404, description: 'Size not found' })
  updateVariant(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.service.updateVariant(ctx.effectiveOwnerId, id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Archive a size — blocked while it still has stock (owner only)',
  })
  @ApiResponse({ status: 200, description: 'Size archived' })
  @ApiResponse({ status: 400, description: 'Size still has stock' })
  @ApiResponse({ status: 404, description: 'Size not found' })
  archiveVariant(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.service.archiveVariant(ctx.effectiveOwnerId, id, variantId);
  }

  @Post(':id/stock')
  @AllowedFor('OWNER')
  @ApiOperation({
    summary:
      'Add per-size personal stock to a group in one atomic transaction (owner only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Array of inventory entries created/updated',
  })
  @ApiResponse({
    status: 400,
    description: 'A size does not belong to this group',
  })
  addStock(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: AddGroupStockDto,
  ) {
    return this.service.addStock(ctx.effectiveOwnerId, id, dto);
  }
}
