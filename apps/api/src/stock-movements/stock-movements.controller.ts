import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementsFilterDto } from './dto/stock-movements-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('stock-movements')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class StockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

  @Get('movements')
  @ApiOperation({
    summary: 'List stock movements (audit ledger) — paginated, filterable',
  })
  @ApiResponse({ status: 200, description: '{ data, total }' })
  list(@CurrentActorContext() ctx: ActorContext, @Query() filter: StockMovementsFilterDto) {
    return this.service.findAll(ctx.effectiveOwnerId, filter);
  }

  @Get('entries/:entryId/movements')
  @ApiOperation({
    summary: 'List all movements for one inventory entry (no pagination)',
  })
  @ApiResponse({ status: 200, description: 'Array of stock movements' })
  byEntry(@CurrentActorContext() ctx: ActorContext, @Param('entryId') entryId: string) {
    return this.service.findByEntry(ctx.effectiveOwnerId, entryId);
  }
}
