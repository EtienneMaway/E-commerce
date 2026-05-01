import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
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
}
