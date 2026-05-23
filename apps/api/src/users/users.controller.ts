import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserSearchResultDto } from './dto/user-search-result.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';
import { UserPublicDto } from '../auth/dto/auth-response.dto';

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

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile (name, email, phone)' })
  @ApiResponse({ status: 200, type: UserPublicDto })
  @ApiResponse({ status: 409, description: 'Email or phone already in use' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserPublicDto> {
    const updated = await this.usersService.updateProfile(user.id, dto);
    return this.usersService.toPublic(updated);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    await this.usersService.changePassword(user.id, dto);
    return { success: true };
  }

  @Delete('me')
  @ApiOperation({
    summary: 'Request deletion of the current account',
    description:
      'Soft-deletes the account immediately and starts a 7-day grace window. The user is logged out client-side. Logging in within the grace period exposes a restore path; after the window the account is anonymized.',
  })
  @ApiResponse({ status: 200, description: 'Account scheduled for deletion' })
  @ApiResponse({ status: 401, description: 'Password is incorrect' })
  async deleteAccount(
    @CurrentUser() user: User,
    @Body() dto: DeleteAccountDto,
  ): Promise<{ deletedAt: string; expiresAt: string }> {
    const updated = await this.usersService.requestDeletion(user.id, dto.password);
    return {
      deletedAt: updated.deletedAt!.toISOString(),
      expiresAt: this.usersService.graceExpiresAt(updated.deletedAt!).toISOString(),
    };
  }

}
