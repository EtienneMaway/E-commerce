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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

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
  create(@CurrentUser() user: User, @Body() dto: CreateExternalContactDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all external contacts for the current trader' })
  @ApiResponse({ status: 200, description: 'Array of contacts with balances' })
  findAll(@CurrentUser() user: User) {
    return this.service.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one external contact with full transaction history' })
  @ApiResponse({ status: 200, description: 'Contact with transactions' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update external contact info' })
  @ApiResponse({ status: 200, description: 'Contact updated' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateExternalContactDto) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete external contact (cascade-deletes transactions)' })
  @ApiResponse({ status: 204, description: 'Contact deleted' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  @Post(':id/product-out')
  @ApiOperation({ summary: 'Give products to external debtor (deducts inventory)' })
  @ApiResponse({ status: 201, description: 'Transaction recorded, inventory deducted' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or contact not a debtor' })
  recordProductOut(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RecordProductOutDto,
  ) {
    return this.service.recordProductOut(user.id, id, dto);
  }

  @Post(':id/payment-in')
  @ApiOperation({ summary: 'Record cash received from external debtor' })
  @ApiResponse({ status: 201, description: 'Payment recorded, debtorBalance decreased' })
  recordPaymentIn(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RecordPaymentInDto,
  ) {
    return this.service.recordPaymentIn(user.id, id, dto);
  }

  @Post(':id/product-in')
  @ApiOperation({ summary: 'Record products received from external supplier (adds to inventory)' })
  @ApiResponse({ status: 201, description: 'Transaction recorded, inventory created' })
  recordProductIn(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RecordProductInDto,
  ) {
    return this.service.recordProductIn(user.id, id, dto);
  }

  @Post(':id/payment-out')
  @ApiOperation({ summary: 'Record cash paid to external supplier' })
  @ApiResponse({ status: 201, description: 'Payment recorded, supplierBalance decreased' })
  recordPaymentOut(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RecordPaymentOutDto,
  ) {
    return this.service.recordPaymentOut(user.id, id, dto);
  }

  @Delete(':id/transactions/:txId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a transaction and reverse its balance effect',
    description: 'Inventory changes are NOT reversed — only the balance is corrected.',
  })
  @ApiResponse({ status: 204, description: 'Transaction deleted, balance corrected' })
  deleteTransaction(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('txId') txId: string,
  ) {
    return this.service.deleteTransaction(user.id, id, txId);
  }
}
