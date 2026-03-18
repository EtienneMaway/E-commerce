import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserSearchResultDto } from './dto/user-search-result.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

@ApiTags('users')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search users by username, email, or phone (min 2 chars)' })
  @ApiResponse({ status: 200, type: [UserSearchResultDto] })
  @ApiResponse({ status: 400, description: 'Query too short (min 2 chars)' })
  search(
    @Query() queryDto: UserSearchQueryDto,
    @CurrentUser() user: User,
  ): Promise<UserSearchResultDto[]> {
    return this.usersService.search(queryDto.q, user.id);
  }
}
