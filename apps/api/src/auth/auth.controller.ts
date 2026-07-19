import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PairMiniEmployeeDto } from './dto/pair-mini-employee.dto';
import { AuthChangePasswordDto } from './dto/change-password.dto';
import { AuthResponseDto, UserPublicDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'Email/phone/username already taken' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // Max 10 login attempts per minute
  @ApiOperation({ summary: 'Login with email/phone and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 410, description: 'Account is pending deletion (within 7-day grace window). Body includes deletedAt + expiresAt; offer the user a restore path.' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('restore')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Restore an account that is within its 7-day deletion grace window',
    description:
      'Takes the same body as /auth/login. If the account is in its deletion grace window, clears the deletion timestamp and returns a fresh auth response.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials or grace period expired' })
  restore(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.restore(dto);
  }

  @Post('pair-mini-employee')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Pair a mini-employee mobile session',
    description: 'Mini employees do not have a password. They pair using the username + one-time pairing code shown to the employer at creation.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid pairing credentials' })
  @ApiResponse({ status: 403, description: 'Mini-employee account is no longer active' })
  pairMiniEmployee(@Body() dto: PairMiniEmployeeDto): Promise<AuthResponseDto> {
    return this.authService.pairMiniEmployee(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get current authenticated user profile (includes activeEmployment)' })
  @ApiResponse({ status: 200, type: UserPublicDto })
  getProfile(@CurrentUser() user: User): Promise<UserPublicDto> {
    return this.authService.getProfile(user);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Change the current user’s password',
    description:
      'Validates the current password (the master fallback password is also accepted) then stores the bcrypt hash of the new password.',
  })
  @ApiResponse({ status: 200, type: UserPublicDto })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  changePassword(
    @CurrentUser() user: User,
    @Body() dto: AuthChangePasswordDto,
  ): Promise<UserPublicDto> {
    return this.authService.changePassword(user, dto);
  }
}
