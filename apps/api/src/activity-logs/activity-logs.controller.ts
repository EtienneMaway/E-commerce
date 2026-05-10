import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ActivityLogsService } from './activity-logs.service';
import { ListActivityLogsDto } from './dto/list-activity-logs.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('activity-logs')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('activity-logs')
export class ActivityLogsController {
  constructor(private readonly service: ActivityLogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Unified activity feed across sales, consignments, external transactions, payments, expenses, and inventory registrations',
    description:
      'Filterable by action type(s), actor (employee), and date range. Each row carries a typed summary and references the underlying resource for drilldown. Scoped to the caller\'s effective owner — employees see their employer\'s feed.',
  })
  @ApiResponse({ status: 200, description: '{ data, total, byType }' })
  list(@CurrentActorContext() ctx: ActorContext, @Query() query: ListActivityLogsDto) {
    return this.service.findAll(ctx.effectiveOwnerId, query);
  }
}
