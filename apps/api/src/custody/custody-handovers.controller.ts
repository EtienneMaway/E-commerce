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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';
import { CustodyHandoversService } from './custody-handovers.service';
import type { CustodyHandoverPreview } from './custody-handovers.service';
import { CreateCustodyHandoverDto } from './dto/create-handover.dto';
import { CreateHandoverAdjustmentDto } from './dto/handover-adjustment.dto';
import { ListCustodyHandoversDto, RejectCustodyHandoverDto } from './dto/list-handovers.dto';
import { CustodyHandover, CustodyHandoverAdjustment } from '../entities';

/**
 * Registered BEFORE `CustodyController` in the module, so the literal
 * `handovers` segment is matched before that controller's `:id` patterns get a
 * chance at it. Within this class the same rule applies — literal-first, then
 * `:id` — for the reason spelled out on `CustodyController`.
 */
@ApiTags('custody-handovers')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('custody')
export class CustodyHandoversController {
  constructor(private readonly service: CustodyHandoversService) {}

  // ─── Custodian ─────────────────────────────────────────────────────────────

  @Get('mine/handover-preview')
  @RequiresService('custody.hold')
  @ApiOperation({
    summary: 'What I would owe if I closed the period right now',
    description:
      'Sold lines, voided lines, expenses, what the books expect back, and the lots I am still holding for the returns picker.',
  })
  preview(@CurrentActorContext() ctx: ActorContext): Promise<CustodyHandoverPreview | null> {
    return this.service.preview(ctx);
  }

  @Get('mine/handovers')
  @RequiresService('custody.hold')
  @ApiOperation({ summary: 'My own handover history' })
  @ApiResponse({ status: 200, type: [CustodyHandover] })
  myHandovers(@CurrentActorContext() ctx: ActorContext): Promise<CustodyHandover[]> {
    return this.service.myHandovers(ctx);
  }

  @Post('handovers')
  @RequiresService('custody.hold')
  @ApiOperation({
    summary: 'Hand over the period — cash, unsold returns, notes',
    description:
      'Refused while any sale in the period is still awaiting my approval: the period must actually have been gone through before it can be closed.',
  })
  @ApiResponse({ status: 201, type: CustodyHandover })
  @ApiResponse({ status: 409, description: 'Sales still unattested, or a handover is already pending' })
  submit(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: CreateCustodyHandoverDto,
  ): Promise<CustodyHandover> {
    return this.service.submit(ctx, dto);
  }

  // ─── Owner: reviewing and settling ─────────────────────────────────────────

  @Get('handovers')
  @RequiresService('handovers.approve')
  @ApiOperation({
    summary: 'Handovers of all full employees, filterable by person and state',
  })
  @ApiResponse({ status: 200, type: [CustodyHandover] })
  list(
    @CurrentActorContext() ctx: ActorContext,
    @Query() query: ListCustodyHandoversDto,
  ): Promise<CustodyHandover[]> {
    return this.service.list(ctx, query);
  }

  @Delete('handovers/adjustments/:id')
  @RequiresService('handovers.approve')
  @ApiOperation({ summary: 'Remove a hand-written line while the handover is still pending' })
  @ApiResponse({ status: 200, description: 'Removed' })
  removeAdjustment(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.removeAdjustment(ctx, id);
  }

  @Get('handovers/:id')
  @RequiresService('handovers.approve')
  @ApiResponse({ status: 200, type: CustodyHandover })
  @ApiOperation({ summary: 'One handover, with its returns and hand-written lines' })
  findOne(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustodyHandover> {
    return this.service.findOne(ctx, id);
  }

  @Post('handovers/:id/adjustments')
  @RequiresService('handovers.approve')
  @ApiOperation({
    summary: 'Type a shortage, an overage or a note onto the handover',
    description:
      'The app does not compute the difference — the owner counts, decides, and writes it in with a reason. Item lines become typed stock movements on approval; cash lines are the record and the net.',
  })
  @ApiResponse({ status: 201, type: CustodyHandoverAdjustment })
  addAdjustment(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateHandoverAdjustmentDto,
  ): Promise<CustodyHandoverAdjustment> {
    return this.service.addAdjustment(ctx, id, dto);
  }

  @Patch('handovers/:id/approve')
  @RequiresService('handovers.approve')
  @ApiOperation({
    summary: 'Settle the handover',
    description:
      'Returns go back on the unassigned shelf and item adjustments land as typed stock movements. No cash is booked — a custodian\'s sales already counted towards the branch when they happened.',
  })
  @ApiResponse({ status: 200, type: CustodyHandover })
  @ApiResponse({ status: 403, description: 'You cannot approve your own handover' })
  approve(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustodyHandover> {
    return this.service.approve(ctx, id);
  }

  @Patch('handovers/:id/reject')
  @RequiresService('handovers.approve')
  @ApiOperation({
    summary: 'Send it back',
    description: 'No side effects. The period stays open and can be submitted again.',
  })
  @ApiResponse({ status: 200, type: CustodyHandover })
  reject(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectCustodyHandoverDto,
  ): Promise<CustodyHandover> {
    return this.service.reject(ctx, id, dto);
  }
}
