import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';
import { BranchBalance, BranchPayment, BranchTransfer } from '../entities';
import { BranchTransfersService } from './branch-transfers.service';
import type { BranchDestination } from './branch-transfers.service';
import { CreateBranchTransferDto } from './dto/create-branch-transfer.dto';
import { RejectBranchTransferDto } from './dto/reject-branch-transfer.dto';
import { CreateBranchPaymentDto } from './dto/create-branch-payment.dto';
import type { Paginated } from '../common/pagination';
import { ListBranchTransfersDto } from './dto/list-branch-transfers.dto';

/**
 * Branch-to-branch stock transfers (`BRANCH_TRANSFER_PLAN.md`).
 *
 * "The owner, or the person in charge of this branch" — at the guard that is
 * `custody.manage` (owner-only) or `custody.hold` (granted automatically to
 * whoever is the OPEN custodian). The service then checks the custody is at
 * THIS branch. No ordinary role key grants it: the person in charge is a fact
 * about the branch, not a permission someone can be handed.
 *
 * ROUTE ORDER: the literal segments (`destinations`, `balances`, `payments`)
 * are declared before `:id` so they are never parsed as an id.
 */
@ApiTags('branch-transfers')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@AllowedFor('OWNER', 'FULL_EMPLOYEE')
@RequiresService('custody.manage', 'custody.hold')
@Controller('branch-transfers')
export class BranchTransfersController {
  constructor(private readonly service: BranchTransfersService) {}

  @Get('destinations')
  @ApiOperation({ summary: 'Other open branches of this business that can receive a transfer' })
  @ApiResponse({ status: 200, description: 'List of { shopId, name, isDefault }' })
  destinations(@CurrentActorContext() ctx: ActorContext): Promise<BranchDestination[]> {
    return this.service.destinations(ctx);
  }

  @Get('balances')
  @ApiOperation({ summary: 'What this branch owes other branches, and is owed by them' })
  @ApiResponse({ status: 200, type: [BranchBalance] })
  balances(@CurrentActorContext() ctx: ActorContext): Promise<BranchBalance[]> {
    return this.service.balances(ctx);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Payments between this branch and the others' })
  @ApiResponse({ status: 200, type: [BranchPayment] })
  payments(@CurrentActorContext() ctx: ActorContext): Promise<BranchPayment[]> {
    return this.service.payments(ctx);
  }

  @Post('payments')
  @ApiOperation({
    summary: 'Pay back a branch this branch owes',
    description:
      "The owner's payment is confirmed immediately. A custodian's payment stays PENDING until the receiving branch confirms the money arrived.",
  })
  @ApiResponse({ status: 201, type: BranchPayment })
  @ApiResponse({ status: 400, description: 'Nothing owed, or more than what is owed' })
  @ApiResponse({ status: 409, description: 'A payment to that branch is already waiting' })
  pay(@CurrentActorContext() ctx: ActorContext, @Body() dto: CreateBranchPaymentDto): Promise<BranchPayment> {
    return this.service.pay(ctx, dto);
  }

  @Patch('payments/:id/confirm')
  @ApiOperation({ summary: 'Confirm a payment from another branch arrived' })
  @ApiResponse({ status: 200, type: BranchPayment })
  confirmPayment(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BranchPayment> {
    return this.service.confirmPayment(ctx, id);
  }

  @Patch('payments/:id/reject')
  @ApiOperation({ summary: 'Say a payment from another branch never arrived' })
  @ApiResponse({ status: 200, type: BranchPayment })
  rejectPayment(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BranchPayment> {
    return this.service.rejectPayment(ctx, id);
  }

  @Get()
  @ApiOperation({ summary: 'Transfers in and out of this branch (every branch under "All branches")' })
  @ApiResponse({ status: 200, type: [BranchTransfer] })
  list(
    @CurrentActorContext() ctx: ActorContext,
    @Query() filter: ListBranchTransfersDto,
  ): Promise<BranchTransfer[] | Paginated<BranchTransfer>> {
    return this.service.list(ctx, filter);
  }

  @Post()
  @ApiOperation({
    summary: 'Send stock to another branch',
    description:
      'The goods leave this branch at once and wait in escrow until the receiving branch receives (all of it) or rejects (all of it).',
  })
  @ApiResponse({ status: 201, type: BranchTransfer })
  @ApiResponse({ status: 400, description: 'Not enough stock, or an invalid destination' })
  @ApiResponse({ status: 403, description: 'Not the owner or the person in charge of this branch' })
  send(@CurrentActorContext() ctx: ActorContext, @Body() dto: CreateBranchTransferDto): Promise<BranchTransfer> {
    return this.service.send(ctx, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One transfer, with its lines' })
  @ApiResponse({ status: 200, type: BranchTransfer })
  findOne(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BranchTransfer> {
    return this.service.findOne(ctx, id);
  }

  @Patch(':id/receive')
  @ApiOperation({
    summary: 'Verify and receive everything in this transfer',
    description: 'All or nothing. The goods join this branch’s stock and this branch now owes the sender their cost.',
  })
  @ApiResponse({ status: 200, type: BranchTransfer })
  @ApiResponse({ status: 409, description: 'Already answered' })
  receive(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BranchTransfer> {
    return this.service.receive(ctx, id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject the whole transfer; the goods go back to the sending branch' })
  @ApiResponse({ status: 200, type: BranchTransfer })
  reject(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectBranchTransferDto,
  ): Promise<BranchTransfer> {
    return this.service.reject(ctx, id, dto.reason);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Withdraw a transfer the receiving branch has not answered yet' })
  @ApiResponse({ status: 200, type: BranchTransfer })
  cancel(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BranchTransfer> {
    return this.service.cancel(ctx, id);
  }
}
