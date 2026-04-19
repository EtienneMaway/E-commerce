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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

@ApiTags('expenses')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Record a new expense' })
  @ApiResponse({ status: 201, description: 'Expense created' })
  create(@CurrentUser() user: User, @Body() dto: CreateExpenseDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List expenses with filters and USD totals',
    description:
      'Supports period filters (today, week, month, lastNDays) or explicit from/to dates. ' +
      'Category filter optional. Returns per-row USD equivalent and per-category totals.',
  })
  @ApiResponse({ status: 200, description: 'Expenses with totals breakdown' })
  list(@CurrentUser() user: User, @Query() query: ListExpensesQueryDto) {
    return this.service.list(user.id, query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an expense entry' })
  @ApiResponse({ status: 204, description: 'Expense deleted' })
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.id, id);
  }
}
