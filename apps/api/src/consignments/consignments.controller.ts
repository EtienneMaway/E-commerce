import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConsignmentsService } from './consignments.service';
import { CreateConsignmentDto } from './dto/create-consignment.dto';
import { ConsignmentRequest } from '../entities';

@ApiTags('consignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('consignments')
export class ConsignmentsController {
  constructor(private readonly consignmentsService: ConsignmentsService) {}

  // ─── Supplier actions ──────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Send a consignment request to a debtor (supplier action)' })
  @ApiResponse({ status: 201, type: ConsignmentRequest, description: 'Request created with PENDING status' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or invalid debtor' })
  create(
    @CurrentUser('id') supplierId: string,
    @Body() dto: CreateConsignmentDto,
  ): Promise<ConsignmentRequest> {
    return this.consignmentsService.create(supplierId, dto);
  }

  @Get('outgoing')
  @ApiOperation({ summary: 'List all consignment requests sent by the current user (as supplier)' })
  @ApiResponse({ status: 200, type: [ConsignmentRequest] })
  findOutgoing(@CurrentUser('id') supplierId: string): Promise<ConsignmentRequest[]> {
    return this.consignmentsService.findOutgoing(supplierId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a PENDING consignment request (supplier action)' })
  @ApiResponse({ status: 200, type: ConsignmentRequest })
  @ApiResponse({ status: 400, description: 'Request is not PENDING' })
  @ApiResponse({ status: 403, description: 'Not your consignment request' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') supplierId: string,
  ): Promise<ConsignmentRequest> {
    return this.consignmentsService.cancel(id, supplierId);
  }

  // ─── Debtor actions ────────────────────────────────────────────────────────

  @Get('incoming')
  @ApiOperation({ summary: 'List all consignment requests sent to the current user (as debtor)' })
  @ApiResponse({ status: 200, type: [ConsignmentRequest] })
  findIncoming(@CurrentUser('id') debtorId: string): Promise<ConsignmentRequest[]> {
    return this.consignmentsService.findIncoming(debtorId);
  }

  @Patch(':id/confirm')
  @ApiOperation({
    summary: 'Confirm receipt of a consignment (debtor action)',
    description:
      'Atomically deducts stock from supplier, creates inventory entries on both sides, and upserts the DebtorCredit record.',
  })
  @ApiResponse({ status: 200, type: ConsignmentRequest, description: 'Status set to ACCEPTED' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or not PENDING' })
  @ApiResponse({ status: 403, description: 'Consignment not addressed to you' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') debtorId: string,
  ): Promise<ConsignmentRequest> {
    return this.consignmentsService.confirm(id, debtorId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a PENDING consignment request (debtor action)' })
  @ApiResponse({ status: 200, type: ConsignmentRequest, description: 'Status set to REJECTED' })
  @ApiResponse({ status: 400, description: 'Request is not PENDING' })
  @ApiResponse({ status: 403, description: 'Consignment not addressed to you' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') debtorId: string,
  ): Promise<ConsignmentRequest> {
    return this.consignmentsService.reject(id, debtorId);
  }
}
