import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';
import { CustodyService } from './custody.service';
import type { CustodyOverview } from './custody.service';
import { AppointCustodianDto } from './dto/appoint-custodian.dto';
import { CreateStockIssueDto } from './dto/create-stock-issue.dto';
import { RejectStockIssueDto } from './dto/reject-stock-issue.dto';
import { AddCustodyTeamMemberDto } from './dto/add-team-member.dto';
import { ApproveSalesDto } from './dto/approve-sales.dto';
import { CustodyTeamMember, SaleTransaction, StockCustody, StockIssue } from '../entities';

/**
 * ROUTE ORDER IS load-bearing in this controller. Express matches in
 * declaration order, so every route whose first segment is a literal
 * (`current`, `mine`, `issues`, `team`) is declared BEFORE the `:id` routes.
 * With `GET /custody/:id/issues` declared first, `GET /custody/mine/issues`
 * matches it with `id = "mine"` and dies on the UUID pipe instead of reaching
 * the custodian's own inbox. Add new `:id` routes at the bottom.
 */
@ApiTags('custody')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('custody')
export class CustodyController {
  constructor(private readonly service: CustodyService) {}

  // ─── Owner: the appointment ────────────────────────────────────────────────

  @Post()
  @AllowedFor('OWNER')
  @RequiresService('custody.manage')
  @ApiOperation({
    summary: "Put a full employee in charge of this branch's stock",
    description:
      'Creates the appointment. With `sweepExistingStock`, also offers every unassigned lot at the branch as an opening volume — still PENDING until the employee accepts it.',
  })
  @ApiResponse({ status: 201, type: StockCustody })
  @ApiResponse({ status: 409, description: 'This branch already has an active custodian' })
  appoint(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: AppointCustodianDto,
  ): Promise<StockCustody> {
    return this.service.appoint(ctx, dto);
  }

  @Get('current')
  @RequiresService('custody.manage')
  @ApiOperation({ summary: "The branch's current custodian, or null if nobody is appointed" })
  @ApiResponse({ status: 200, type: StockCustody })
  current(@CurrentActorContext() ctx: ActorContext): Promise<StockCustody | null> {
    return this.service.current(ctx);
  }

  // ─── Custodian: my volume ──────────────────────────────────────────────────

  @Get('mine')
  @RequiresService('custody.hold')
  @ApiOperation({
    summary: 'My volume — what I am holding and what I still owe an answer on',
    description:
      "Scoped to this custodian's own stock. Deliberately says nothing about the branch's cash or the rest of the business.",
  })
  mine(@CurrentActorContext() ctx: ActorContext): Promise<CustodyOverview | null> {
    return this.service.mine(ctx);
  }

  @Get('mine/issues')
  @RequiresService('custody.hold')
  @ApiOperation({ summary: 'Volumes offered to me and not yet answered' })
  @ApiResponse({ status: 200, type: [StockIssue] })
  myIssues(@CurrentActorContext() ctx: ActorContext): Promise<StockIssue[]> {
    return this.service.myIssues(ctx);
  }

  @Get('mine/pending-sales')
  @RequiresService('custody.hold')
  @ApiOperation({ summary: 'Sales from my volume I have not gone through yet' })
  @ApiResponse({ status: 200, type: [SaleTransaction] })
  pendingSales(@CurrentActorContext() ctx: ActorContext): Promise<SaleTransaction[]> {
    return this.service.pendingSales(ctx);
  }

  @Post('mine/approve-sales')
  @RequiresService('custody.hold')
  @ApiOperation({
    summary: "Attest to a batch of the team's sales",
    description:
      'Approval is an attestation, not a ledger gate — these sales already counted. It is what lets the period be handed over. `expectedCount` must match what the client listed, so a queue that grew since the screen was rendered is refused rather than waved through.',
  })
  @ApiResponse({ status: 201, description: 'Number of sales attested to' })
  @ApiResponse({ status: 409, description: 'The list changed since it was opened' })
  approveSales(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: ApproveSalesDto,
  ): Promise<{ approved: number }> {
    return this.service.approveSales(ctx, dto);
  }

  // ─── Answering a volume, by issue id ───────────────────────────────────────

  @Patch('issues/:id/accept')
  @RequiresService('custody.hold')
  @ApiOperation({
    summary: 'Take the volume',
    description:
      "Splits the named lots and stamps them to me, carrying each lot's original cost verbatim. Atomic.",
  })
  @ApiResponse({ status: 200, type: StockIssue })
  @ApiResponse({ status: 400, description: 'Not enough unassigned stock to cover a line' })
  acceptIssue(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockIssue> {
    return this.service.acceptIssue(ctx, id);
  }

  @Patch('issues/:id/reject')
  @RequiresService('custody.hold')
  @ApiOperation({ summary: 'Refuse the volume. No side effects.' })
  @ApiResponse({ status: 200, type: StockIssue })
  rejectIssue(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectStockIssueDto,
  ): Promise<StockIssue> {
    return this.service.rejectIssue(ctx, id, dto);
  }

  @Patch('issues/:id/cancel')
  @AllowedFor('OWNER')
  @RequiresService('custody.manage')
  @ApiOperation({ summary: 'Withdraw a volume the custodian has not answered yet' })
  @ApiResponse({ status: 200, type: StockIssue })
  cancelIssue(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockIssue> {
    return this.service.cancelIssue(ctx, id);
  }

  // ─── The team ──────────────────────────────────────────────────────────────

  @Delete('team/:memberId')
  @RequiresService('custody.manage', 'custody.hold')
  @ApiOperation({
    summary: 'Take someone off the team',
    description:
      'Stamps them as removed; the row stays, because who was selling during a settled period is part of its record.',
  })
  @ApiResponse({ status: 200, description: 'Removed' })
  removeTeamMember(
    @CurrentActorContext() ctx: ActorContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    return this.service.removeTeamMember(ctx, memberId);
  }

  // ─── Routes keyed on a custody id — keep these LAST (see the class note) ───

  @Patch(':id/close')
  @AllowedFor('OWNER')
  @RequiresService('custody.manage')
  @ApiOperation({
    summary: 'End the appointment',
    description:
      'Refused while the custodian still holds stock or has sales nobody has attested to.',
  })
  @ApiResponse({ status: 200, type: StockCustody })
  @ApiResponse({ status: 409, description: 'Stock still held, or sales still unattested' })
  close(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockCustody> {
    return this.service.close(ctx, id);
  }

  @Post(':id/issues')
  @AllowedFor('OWNER')
  @RequiresService('custody.manage')
  @ApiOperation({ summary: 'Hand a volume of stock to the custodian (they must accept it)' })
  @ApiResponse({ status: 201, type: StockIssue })
  createIssue(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStockIssueDto,
  ): Promise<StockIssue> {
    return this.service.createIssue(ctx, id, dto);
  }

  @Get(':id/issues')
  @RequiresService('custody.manage')
  @ApiOperation({ summary: 'Every volume offered under this custody' })
  @ApiResponse({ status: 200, type: [StockIssue] })
  listIssues(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockIssue[]> {
    return this.service.listIssues(ctx, id);
  }

  @Get(':id/team')
  @RequiresService('custody.manage', 'custody.hold')
  @ApiOperation({ summary: 'Who may sell from this volume' })
  @ApiResponse({ status: 200, type: [CustodyTeamMember] })
  team(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustodyTeamMember[]> {
    return this.service.team(ctx, id);
  }

  @Post(':id/team')
  @RequiresService('custody.manage', 'custody.hold')
  @ApiOperation({
    summary: 'Let someone sell from this volume',
    description:
      'The custodian runs their own team; the owner may also add people, including themselves.',
  })
  @ApiResponse({ status: 201, type: CustodyTeamMember })
  addTeamMember(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCustodyTeamMemberDto,
  ): Promise<CustodyTeamMember> {
    return this.service.addTeamMember(ctx, id, dto);
  }
}
