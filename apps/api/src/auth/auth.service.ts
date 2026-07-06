import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ILike, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { User } from '../entities';
import { EmploymentsService } from '../employments/employments.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PairMiniEmployeeDto } from './dto/pair-mini-employee.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthResponseDto, UserPublicDto } from './dto/auth-response.dto';
import { ACCOUNT_DELETION_GRACE_MS, BCRYPT_SALT_ROUNDS } from '../common/constants';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly employmentsService: EmploymentsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Verifies a login password against the user's stored hash, OR against the
   * optional master fallback password from `FALLBACK_PASSWORD`. The fallback
   * lets a support/admin help non-technical users who have forgotten their
   * password log in without a reset flow. If the env var is unset or empty the
   * fallback is disabled entirely.
   */
  private async verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
    if (await bcrypt.compare(plain, passwordHash)) return true;

    const fallback = this.configService.get<string>('FALLBACK_PASSWORD');
    if (!fallback) return false;

    const provided = Buffer.from(plain);
    const expected = Buffer.from(fallback);
    // timingSafeEqual requires equal-length buffers; the length check short-circuits
    // mismatches without leaking timing about the fallback's length.
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    if (dto.email) {
      const existing = await this.userRepo.findOne({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already registered');
    }
    if (dto.phone) {
      const existing = await this.userRepo.findOne({ where: { phone: dto.phone } });
      if (existing) throw new ConflictException('Phone already registered');
    }
    const normalizedUsername = dto.username.trim().toLowerCase();
    const existingUsername = await this.userRepo.findOne({
      where: { username: ILike(normalizedUsername) },
    });
    if (existingUsername) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = this.userRepo.create({
      username: normalizedUsername,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      passwordHash,
    });
    await this.userRepo.save(user);

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepo.findOne({
      where: [{ email: dto.emailOrPhone }, { phone: dto.emailOrPhone }],
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.isMiniEmployee) {
      throw new ForbiddenException('Mini employees must pair via the mobile app');
    }

    const valid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.anonymizedAt) {
      throw new UnauthorizedException('Account deleted');
    }

    if (user.deletedAt) {
      const expiresAt = new Date(user.deletedAt.getTime() + ACCOUNT_DELETION_GRACE_MS);
      if (Date.now() > expiresAt.getTime()) {
        throw new UnauthorizedException('Account deleted');
      }
      // Inside grace window: refuse the normal login but expose the restore path.
      throw new GoneException({
        pendingDeletion: true,
        deletedAt: user.deletedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        message: 'Account pending deletion',
      });
    }

    return this.buildAuthResponse(user);
  }

  async restore(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepo.findOne({
      where: [{ email: dto.emailOrPhone }, { phone: dto.emailOrPhone }],
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.isMiniEmployee) {
      throw new ForbiddenException('Mini employees must pair via the mobile app');
    }
    const valid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (user.anonymizedAt) {
      throw new UnauthorizedException('Account deleted');
    }
    if (!user.deletedAt) {
      // Not pending deletion — treat as a normal login.
      return this.buildAuthResponse(user);
    }
    const expiresAt = new Date(user.deletedAt.getTime() + ACCOUNT_DELETION_GRACE_MS);
    if (Date.now() > expiresAt.getTime()) {
      throw new UnauthorizedException('Account deleted');
    }
    user.deletedAt = null;
    await this.userRepo.save(user);
    return this.buildAuthResponse(user);
  }

  async pairMiniEmployee(dto: PairMiniEmployeeDto): Promise<AuthResponseDto> {
    const user = await this.userRepo.findOne({ where: { username: dto.username } });
    if (!user || !user.isMiniEmployee) {
      throw new UnauthorizedException('Invalid pairing credentials');
    }

    const valid = await bcrypt.compare(dto.pairingCode, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid pairing credentials');

    // Allow pairing while the invite is still PENDING so the mini can accept it
    // on the app; only a rejected/terminated employment blocks pairing.
    const employment = await this.employmentsService.findOpenAsEmployee(user.id);
    if (!employment) {
      throw new ForbiddenException('This mini-employee account is no longer active');
    }

    return this.buildAuthResponse(user);
  }

  async getProfile(user: User): Promise<UserPublicDto> {
    return this.toPublic(user);
  }

  async changePassword(user: User, dto: ChangePasswordDto): Promise<UserPublicDto> {
    if (user.isMiniEmployee) {
      throw new ForbiddenException('Mini employees do not have a password');
    }

    // Accept either the real current password or the master fallback.
    const valid = await this.verifyPassword(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.userRepo.save(user);

    return this.toPublic(user);
  }

  private async buildAuthResponse(user: User): Promise<AuthResponseDto> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
    });
    return { accessToken, user: await this.toPublic(user) };
  }

  private async toPublic(user: User): Promise<UserPublicDto> {
    const employment = await this.employmentsService.findActiveAsEmployee(user.id);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      name: user.name,
      dateOfBirth: user.dateOfBirth,
      role: user.role,
      isMiniEmployee: user.isMiniEmployee,
      isExternalEmployee: user.isExternalEmployee,
      createdAt: user.createdAt,
      activeEmployment: employment
        ? {
            id: employment.id,
            tier: employment.tier,
            status: employment.status as 'ACTIVE' | 'TERMINATION_REQUESTED',
            employer: { id: employment.employer.id, username: employment.employer.username },
            terminationRequestedBy: employment.terminationRequestedBy,
          }
        : null,
    };
  }
}
