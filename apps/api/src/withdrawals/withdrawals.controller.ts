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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WithdrawalsService } from './withdrawals.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

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
  getAvailable(@CurrentUser() user: User) {
    return this.service.getAvailable(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List withdrawal history (most recent first)' })
  @ApiResponse({ status: 200, description: 'Array of withdrawals' })
  list(@CurrentUser() user: User) {
    return this.service.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Record a withdrawal',
    description:
      'Hard-blocks when amount exceeds available. Snapshots period income, expenses and leftover.',
  })
  @ApiResponse({ status: 201, description: 'Withdrawal recorded' })
  @ApiResponse({ status: 400, description: 'Amount exceeds available cash' })
  create(@CurrentUser() user: User, @Body() dto: CreateWithdrawalDto) {
    return this.service.create(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete the most recent withdrawal',
    description:
      'Only the most recent withdrawal can be deleted to keep the leftover chain intact.',
  })
  @ApiResponse({ status: 204, description: 'Withdrawal deleted' })
  @ApiResponse({ status: 403, description: 'Not the most recent withdrawal' })
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.id, id);
  }
}
