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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

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
  list(@CurrentUser() user: User, @Query() filter: StockMovementsFilterDto) {
    return this.service.findAll(user.id, filter);
  }

  @Get('entries/:entryId/movements')
  @ApiOperation({
    summary: 'List all movements for one inventory entry (no pagination)',
  })
  @ApiResponse({ status: 200, description: 'Array of stock movements' })
  byEntry(@CurrentUser() user: User, @Param('entryId') entryId: string) {
    return this.service.findByEntry(user.id, entryId);
  }
}
