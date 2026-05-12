import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ILike, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities';
import { EmploymentsService } from '../employments/employments.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PairMiniEmployeeDto } from './dto/pair-mini-employee.dto';
import { AuthResponseDto, UserPublicDto } from './dto/auth-response.dto';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly employmentsService: EmploymentsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // Check uniqueness
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

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.buildAuthResponse(user);
  }

  async pairMiniEmployee(dto: PairMiniEmployeeDto): Promise<AuthResponseDto> {
    const user = await this.userRepo.findOne({ where: { username: dto.username } });
    if (!user || !user.isMiniEmployee) {
      throw new UnauthorizedException('Invalid pairing credentials');
    }

    const valid = await bcrypt.compare(dto.pairingCode, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid pairing credentials');

    // Refuse to pair a mini employee whose employment was terminated.
    const employment = await this.employmentsService.findActiveAsEmployee(user.id);
    if (!employment) {
      throw new ForbiddenException('This mini-employee account is no longer active');
    }

    return this.buildAuthResponse(user);
  }

  async getProfile(user: User): Promise<UserPublicDto> {
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
