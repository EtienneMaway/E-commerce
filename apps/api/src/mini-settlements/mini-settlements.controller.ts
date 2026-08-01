import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';
import { MiniSettlementsService } from './mini-settlements.service';
import { CreateMiniSettlementDto } from './dto/create-mini-settlement.dto';
import { CreateMiniExpenseDto } from './dto/create-mini-expense.dto';
import { CreateMiniTeamMemberDto } from './dto/create-mini-team-member.dto';
import { MiniActivityQueryDto } from './dto/mini-activity-query.dto';
import { MiniStatsQueryDto } from './dto/mini-stats-query.dto';
import { MiniExpense, MiniSettlement, MiniTeamMember } from '../entities';
import type { ActiveTeamMember } from './mini-settlements.service';

@ApiTags('mini-settlements')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('mini-settlements')
export class MiniSettlementsController {
  constructor(private readonly service: MiniSettlementsService) {}

  // ─── Mini employee actions ─────────────────────────────────────────────────

  @Post()
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Hand over cash + unsold returns to the owner (mini employee action)',
    description:
      'Creates a PENDING handover: the cash collected for sold goods (at the agreed price) plus a list of unsold items to return. Owner/full employee approves it to book the cash and re-stock the returns.',
  })
  @ApiResponse({ status: 201, type: MiniSettlement, description: 'Handover created with PENDING status' })
  @ApiResponse({ status: 400, description: 'Nothing to hand over, or returning more than is unsold' })
  create(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: CreateMiniSettlementDto,
  ): Promise<MiniSettlement> {
    return this.service.create(ctx, dto);
  }

  @Get('outgoing')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({ summary: 'List my handovers (mini employee action)' })
  @ApiResponse({ status: 200, type: [MiniSettlement] })
  findOutgoing(@CurrentActorContext() ctx: ActorContext): Promise<MiniSettlement[]> {
    return this.service.findOutgoing(ctx);
  }

  @Get('my-balance')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'How much the mini currently owes their employer (for the auto handover)',
  })
  @ApiResponse({ status: 200, description: '{ outstanding }' })
  myBalance(@CurrentActorContext() ctx: ActorContext): Promise<{ outstanding: string }> {
    return this.service.myBalance(ctx);
  }

  @Get('stats')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary:
      'Home statistics for a mini employee (I owe / cash to hand over / profit / expenses), windowed by ?period (default: since last handover)',
  })
  @ApiResponse({ status: 200, description: 'MiniStats: iOwe, cashForSold, profitMade, expensesFc, window bounds' })
  getStats(
    @CurrentActorContext() ctx: ActorContext,
    @Query() query: MiniStatsQueryDto,
  ) {
    return this.service.miniStats(ctx, query.period);
  }

  @Get('handover-preview')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Full handover breakdown for the mini: sold products (revenue/profit/owed), returns, cash to hand over',
  })
  @ApiResponse({ status: 200, description: '{ sold, returns, cashForSold, expensesFc }' })
  handoverPreview(@CurrentActorContext() ctx: ActorContext) {
    return this.service.handoverPreview(ctx);
  }

  @Get('team')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Who is out with the goods I am holding (mini employee, read-only)',
    description:
      'The team for the cycle in progress: everyone attached to its consignments plus anyone the employer added on the dashboard. Minis cannot change this list.',
  })
  @ApiResponse({ status: 200, description: 'ActiveTeamMember[]' })
  myTeam(@CurrentActorContext() ctx: ActorContext): Promise<ActiveTeamMember[]> {
    return this.service.myActiveTeam(ctx);
  }

  // ─── Mini employee: pending expenses (FC) ──────────────────────────────────

  @Post('expenses')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Record an expense in FC while selling (mini employee) — pending until the next handover',
  })
  @ApiResponse({ status: 201, type: MiniExpense })
  @ApiResponse({ status: 400, description: 'No products currently held, or invalid amount' })
  createExpense(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: CreateMiniExpenseDto,
  ): Promise<MiniExpense> {
    return this.service.createExpense(ctx, dto);
  }

  @Get('expense-allowance')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'How much I may still spend on expenses this round (mini employee)',
    description:
      'The employer caps expenses at a percentage of what the mini has sold since their last approved handover, so the ceiling grows with sales. Uncapped when the employer has not set one.',
  })
  @ApiResponse({ status: 200, description: '{ pct, soldFc, allowanceFc, spentFc, remainingFc }' })
  expenseAllowance(@CurrentActorContext() ctx: ActorContext) {
    return this.service.expenseAllowance(ctx);
  }

  @Get('expenses')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({
    summary:
      'List my expenses (mini employee). Default: only pending (not-yet-handed-over). Pass ?scope=all for the full history.',
  })
  @ApiResponse({ status: 200, type: [MiniExpense] })
  listExpenses(
    @CurrentActorContext() ctx: ActorContext,
    @Query('scope') scope?: string,
  ): Promise<MiniExpense[]> {
    return scope === 'all'
      ? this.service.listAllExpenses(ctx)
      : this.service.listPendingExpenses(ctx);
  }

  @Delete('expenses/:id')
  @AllowedFor('MINI_EMPLOYEE')
  @ApiOperation({ summary: 'Delete a pending expense (mini employee)' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 400, description: 'Already part of a submitted handover' })
  removeExpense(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.removeExpense(ctx, id);
  }

  // ─── Owner / full employee actions ─────────────────────────────────────────

  @Get('incoming')
  @ApiOperation({ summary: 'List handovers from my mini employees (owner/full employee)' })
  @ApiResponse({ status: 200, type: [MiniSettlement] })
  findIncoming(@CurrentActorContext() ctx: ActorContext): Promise<MiniSettlement[]> {
    return this.service.findIncoming(ctx);
  }

  @Get('mini/:miniUserId/activity')
  @ApiOperation({
    summary: 'Real-time sales + given/sold/outstanding summary for one mini employee (owner/full employee)',
    description:
      'Reads the mini\'s own books through the employment relationship. Sales aggregates are window-scoped (dateFrom/dateTo); debt figures are point-in-time. Poll for near-real-time monitoring.',
  })
  @ApiResponse({ status: 200, description: 'MiniActivity summary + per-sale rows with markup' })
  @ApiResponse({ status: 403, description: 'Not your mini employee' })
  miniActivity(
    @CurrentActorContext() ctx: ActorContext,
    @Param('miniUserId', ParseUUIDPipe) miniUserId: string,
    @Query() query: MiniActivityQueryDto,
  ) {
    return this.service.miniActivity(ctx, miniUserId, query);
  }

  @Get('mini/:miniUserId/team')
  @ApiOperation({
    summary: 'The team on a mini\'s cycle in progress (owner/full employee)',
    description:
      'Everyone out with the goods this mini is holding but has not handed over yet — from the consignments plus anything added here.',
  })
  @ApiResponse({ status: 200, description: 'ActiveTeamMember[]' })
  @ApiResponse({ status: 403, description: 'Not your mini employee' })
  miniTeam(
    @CurrentActorContext() ctx: ActorContext,
    @Param('miniUserId', ParseUUIDPipe) miniUserId: string,
  ): Promise<ActiveTeamMember[]> {
    return this.service.miniActiveTeam(ctx, miniUserId);
  }

  @Get('mini/:miniUserId/unsold')
  @ApiOperation({
    summary: "What a mini is still holding unsold (owner/full employee)",
    description:
      'Per product (and per size), the units not yet sold from what they were entrusted — with the agreed value at each batch\'s locked rate. The detail behind the "still with them" count.',
  })
  @ApiResponse({ status: 200, description: 'MiniUnsoldLine[]' })
  @ApiResponse({ status: 403, description: 'Not your mini employee' })
  miniUnsold(
    @CurrentActorContext() ctx: ActorContext,
    @Param('miniUserId', ParseUUIDPipe) miniUserId: string,
  ) {
    return this.service.miniUnsoldStock(ctx, miniUserId);
  }

  @Post('mini/:miniUserId/team')
  @ApiOperation({
    summary: 'Add someone to a mini\'s cycle in progress (owner/full employee)',
    description:
      'Recorded against the goods currently out; the handover that closes the cycle claims it.',
  })
  @ApiResponse({ status: 201, type: MiniTeamMember })
  @ApiResponse({ status: 403, description: 'Not your mini employee' })
  addActiveTeamMember(
    @CurrentActorContext() ctx: ActorContext,
    @Param('miniUserId', ParseUUIDPipe) miniUserId: string,
    @Body() dto: CreateMiniTeamMemberDto,
  ): Promise<MiniTeamMember> {
    return this.service.addActiveTeamMember(ctx, miniUserId, dto);
  }

  @Post(':id/team')
  @ApiOperation({
    summary: 'Record someone who was out selling with the mini on this handover (owner/full employee)',
    description:
      "Adds to the handover's team record. Available at any time after approval — who was actually along is often only established once the goods are back.",
  })
  @ApiResponse({ status: 201, type: MiniTeamMember })
  @ApiResponse({ status: 400, description: 'Handover is not approved yet' })
  @ApiResponse({ status: 403, description: 'Not your handover' })
  addTeamMember(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: CreateMiniTeamMemberDto,
  ): Promise<MiniTeamMember> {
    return this.service.addTeamMember(ctx, id, dto);
  }

  @Delete('team/:memberId')
  @ApiOperation({ summary: 'Remove someone from a handover\'s team record (owner/full employee)' })
  @ApiResponse({ status: 200, description: 'Removed' })
  @ApiResponse({ status: 403, description: 'Not on one of your handovers' })
  removeTeamMember(
    @CurrentActorContext() ctx: ActorContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    return this.service.removeTeamMember(ctx, memberId);
  }

  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Approve a handover — book the cash and re-stock returns (owner/full employee)',
    description:
      'Atomically: books the cash as one DEBTOR_TO_OWNER payment (differentiated from direct sales), re-stocks returned goods to the owner as a PERSONAL lot, and reverses the mini\'s debt for the returned units.',
  })
  @ApiResponse({ status: 200, type: MiniSettlement, description: 'Status set to APPROVED' })
  @ApiResponse({ status: 400, description: 'Missing credit record or returned units no longer unsold' })
  @ApiResponse({ status: 403, description: 'Handover not addressed to you' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActorContext() ctx: ActorContext,
  ): Promise<MiniSettlement> {
    return this.service.approve(ctx, id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a PENDING handover (owner/full employee)' })
  @ApiResponse({ status: 200, type: MiniSettlement, description: 'Status set to REJECTED' })
  @ApiResponse({ status: 403, description: 'Handover not addressed to you' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActorContext() ctx: ActorContext,
  ): Promise<MiniSettlement> {
    return this.service.reject(ctx, id);
  }
}
