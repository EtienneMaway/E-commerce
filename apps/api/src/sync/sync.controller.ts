import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SyncService, type InboxSignal } from './sync.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('sync')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('signal')
  // Every tier has an inbox: minis get handovers/consignments/salary, owners get
  // incoming handovers and invite responses, full employees get both.
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Change stamps for the caller’s inbox channels',
    description:
      'Returns one epoch-ms stamp per channel. Clients store the last value seen ' +
      'and refetch only the channels whose stamp increased, replacing per-channel ' +
      'polling. The same payload rides on every other response as X-Inbox-Signal, ' +
      'so an active client rarely needs to call this at all.',
  })
  @ApiResponse({ status: 200, description: 'Per-channel change stamps' })
  async getSignal(
    @CurrentActorContext() ctx: ActorContext,
  ): Promise<InboxSignal> {
    // actorId, not effectiveOwnerId — see SyncService.getSignal.
    return this.syncService.getSignal(ctx.actorId);
  }
}
