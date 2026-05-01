import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { ExternalContactsService } from './external-contacts.service';
import { CreateExternalContactDto } from './dto/create-external-contact.dto';
import { UpdateExternalContactDto } from './dto/update-external-contact.dto';
import { RecordProductOutDto } from './dto/record-product-out.dto';
import { RecordPaymentInDto } from './dto/record-payment-in.dto';
import { RecordProductInDto } from './dto/record-product-in.dto';
import { RecordPaymentOutDto } from './dto/record-payment-out.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('external-contacts')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('external-contacts')
export class ExternalContactsController {
  constructor(private readonly service: ExternalContactsService) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new external contact' })
  @ApiResponse({ status: 201, description: 'Contact created' })
  create(@CurrentActorContext() ctx: ActorContext, @Body() dto: CreateExternalContactDto) {
    return this.service.create(ctx, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all external contacts for the current trader' })
  @ApiResponse({ status: 200, description: 'Array of contacts with balances' })
  findAll(@CurrentActorContext() ctx: ActorContext) {
    return this.service.findAll(ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one external contact with full transaction history' })
  @ApiResponse({ status: 200, description: 'Contact with transactions' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  findOne(@CurrentActorContext() ctx: ActorContext, @Param('id') id: string) {
    return this.service.findOne(ctx, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update external contact info' })
  @ApiResponse({ status: 200, description: 'Contact updated' })
  update(@CurrentActorContext() ctx: ActorContext, @Param('id') id: string, @Body() dto: UpdateExternalContactDto) {
    return this.service.update(ctx, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete external contact (cascade-deletes transactions)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Contact deleted' })
  remove(@CurrentActorContext() ctx: ActorContext, @Param('id') id: string) {
    return this.service.remove(ctx, id);
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  @Post(':id/product-out')
  @ApiOperation({ summary: 'Give products to external debtor (deducts inventory)' })
  @ApiResponse({ status: 201, description: 'Transaction recorded, inventory deducted' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or contact not a debtor' })
  @ApiResponse({ status: 422, description: 'DISCOUNT_REASON_REQUIRED — employee priced below owner\'s standard without a reason' })
  recordProductOut(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: RecordProductOutDto,
  ) {
    return this.service.recordProductOut(ctx, id, dto);
  }

  @Post(':id/payment-in')
  @ApiOperation({ summary: 'Record cash received from external debtor' })
  @ApiResponse({ status: 201, description: 'Payment recorded, debtorBalance decreased' })
  recordPaymentIn(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: RecordPaymentInDto,
  ) {
    return this.service.recordPaymentIn(ctx, id, dto);
  }

  @Post(':id/product-in')
  @AllowedFor('OWNER')
  @ApiOperation({ summary: 'Record products received from external supplier (adds to inventory)' })
  @ApiResponse({ status: 201, description: 'Transaction recorded, inventory created' })
  recordProductIn(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: RecordProductInDto,
  ) {
    return this.service.recordProductIn(ctx, id, dto);
  }

  @Post(':id/payment-out')
  @ApiOperation({ summary: 'Record cash paid to external supplier' })
  @ApiResponse({ status: 201, description: 'Payment recorded, supplierBalance decreased' })
  recordPaymentOut(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Body() dto: RecordPaymentOutDto,
  ) {
    return this.service.recordPaymentOut(ctx, id, dto);
  }

  @Delete(':id/transactions/:txId')
  @AllowedFor('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a transaction and reverse its balance effect',
    description: 'Inventory changes are NOT reversed — only the balance is corrected.',
  })
  @ApiResponse({ status: 204, description: 'Transaction deleted, balance corrected' })
  deleteTransaction(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id') id: string,
    @Param('txId') txId: string,
  ) {
    return this.service.deleteTransaction(ctx, id, txId);
  }
}
