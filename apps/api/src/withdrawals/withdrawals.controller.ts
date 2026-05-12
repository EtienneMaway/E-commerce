import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { WithdrawalsService } from './withdrawals.service';
import { ListWithdrawalsQueryDto } from './dto/list-withdrawals-query.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('withdrawals')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly service: WithdrawalsService) {}

  @Get('available')
  @ApiOperation({
    summary: 'Cash available for withdrawal right now',
    description:
      'Returns income − expenses since the last withdrawal, plus any leftover carried over.',
  })
  @ApiResponse({ status: 200, description: 'AvailableWithdrawal snapshot' })
  getAvailable(@CurrentActorContext() ctx: ActorContext) {
    return this.service.getAvailable(ctx.effectiveOwnerId);
  }

  @Get()
  @ApiOperation({ summary: 'List withdrawal history (most recent first, paginated)' })
  @ApiResponse({ status: 200, description: '{ data, pagination }' })
  list(@CurrentActorContext() ctx: ActorContext, @Query() query: ListWithdrawalsQueryDto) {
    return this.service.list(ctx.effectiveOwnerId, query.page, query.limit);
  }

  @Post()
  @AllowedFor('OWNER')
  @ApiOperation({
    summary: 'Record a withdrawal (owner only — moves business cash to the owner)',
    description:
      'Hard-blocks when amount exceeds available. Snapshots period income, expenses and leftover.',
  })
  @ApiResponse({ status: 201, description: 'Withdrawal recorded' })
  @ApiResponse({ status: 400, description: 'Amount exceeds available cash' })
  create(@CurrentActorContext() ctx: ActorContext, @Body() dto: CreateWithdrawalDto) {
    return this.service.create(ctx.effectiveOwnerId, dto);
  }

  @Delete(':id')
  @AllowedFor('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete the most recent withdrawal (owner only)',
    description:
      'Only the most recent withdrawal can be deleted to keep the leftover chain intact.',
  })
  @ApiResponse({ status: 204, description: 'Withdrawal deleted' })
  @ApiResponse({ status: 403, description: 'Not the most recent withdrawal' })
  remove(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(ctx.effectiveOwnerId, id);
  }
}
