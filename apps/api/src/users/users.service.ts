import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, LessThan, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../entities';
import { UserSearchResultDto } from './dto/user-search-result.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserChangePasswordDto } from './dto/change-password.dto';
import { UserPublicDto } from '../auth/dto/auth-response.dto';
import { EmploymentsService } from '../employments/employments.service';
import {
  ACCOUNT_DELETION_GRACE_MS,
  ACCOUNT_PURGE_SWEEP_INTERVAL_MS,
  BCRYPT_SALT_ROUNDS,
  TOMBSTONE_NAME,
} from '../common/constants';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private purgeInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly employmentsService: EmploymentsService,
  ) {}

  async toPublic(user: User): Promise<UserPublicDto> {
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

  onModuleInit(): void {
    // Periodic anonymization of accounts past the soft-delete grace window.
    // No-op in test runs.
    if (process.env.NODE_ENV === 'test') return;
    this.purgeInterval = setInterval(() => {
      this.purgeExpiredAccounts().catch((err: unknown) => {
        this.logger.error('Account purge sweep failed', err);
      });
    }, ACCOUNT_PURGE_SWEEP_INTERVAL_MS);
    // Kick off once at boot so a restart can clear backlogs.
    this.purgeExpiredAccounts().catch((err: unknown) => {
      this.logger.error('Initial account purge sweep failed', err);
    });
  }

  async search(query: string, requesterId: string): Promise<UserSearchResultDto[]> {
    const q = query.trim();
    const users = await this.userRepo.find({
      where: [
        { username: ILike(`%${q}%`), id: Not(requesterId), deletedAt: IsNull(), anonymizedAt: IsNull() },
        { email: ILike(`%${q}%`), id: Not(requesterId), deletedAt: IsNull(), anonymizedAt: IsNull() },
        { phone: ILike(`%${q}%`), id: Not(requesterId), deletedAt: IsNull(), anonymizedAt: IsNull() },
      ],
      select: ['id', 'username', 'email', 'phone'],
      take: 20,
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      phone: u.phone,
    }));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.deletedAt || user.anonymizedAt) {
      throw new UnauthorizedException('Account deleted');
    }

    // Mini- and external-employee profiles are managed by their employer, not self-edited.
    if (user.isMiniEmployee || user.isExternalEmployee) {
      throw new BadRequestException('Employee profiles are managed by the employer');
    }

    if (dto.email !== undefined && dto.email !== user.email) {
      if (dto.email !== null) {
        const existing = await this.userRepo.findOne({ where: { email: dto.email } });
        if (existing && existing.id !== userId) {
          throw new ConflictException('Email already registered');
        }
      }
      user.email = dto.email;
    }

    if (dto.phone !== undefined && dto.phone !== user.phone) {
      if (dto.phone !== null) {
        const existing = await this.userRepo.findOne({ where: { phone: dto.phone } });
        if (existing && existing.id !== userId) {
          throw new ConflictException('Phone already registered');
        }
      }
      user.phone = dto.phone;
    }

    if (dto.name !== undefined) {
      user.name = dto.name ?? null;
    }

    // Enforce: at least one of email or phone must remain set so the user can still log in.
    if (!user.email && !user.phone) {
      throw new BadRequestException('At least one of email or phone is required');
    }

    return this.userRepo.save(user);
  }

  async changePassword(userId: string, dto: UserChangePasswordDto): Promise<void> {
    // passwordHash is select:false — opt in, this path verifies it.
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('User not found');
    if (user.deletedAt || user.anonymizedAt) {
      throw new UnauthorizedException('Account deleted');
    }
    if (user.isMiniEmployee) {
      throw new BadRequestException('Mini-employee accounts do not use a password');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current password');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.userRepo.save(user);
  }

  async requestDeletion(userId: string, password: string): Promise<User> {
    // passwordHash is select:false — opt in, this path verifies it.
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('User not found');
    if (user.deletedAt || user.anonymizedAt) {
      throw new BadRequestException('Account is already pending deletion');
    }
    if (user.isMiniEmployee || user.isExternalEmployee) {
      throw new BadRequestException('Employee profiles are deleted by the employer');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Password is incorrect');

    user.deletedAt = new Date();
    return this.userRepo.save(user);
  }

  graceExpiresAt(deletedAt: Date): Date {
    return new Date(deletedAt.getTime() + ACCOUNT_DELETION_GRACE_MS);
  }

  /**
   * Anonymize accounts whose grace period has expired. Keeps the row so transactional
   * history (debts, sales, consignments) stays intact for counterparties — but PII is
   * cleared and the password hash is replaced with an unguessable value.
   */
  async purgeExpiredAccounts(): Promise<number> {
    const cutoff = new Date(Date.now() - ACCOUNT_DELETION_GRACE_MS);
    const expired = await this.userRepo.find({
      where: { deletedAt: LessThan(cutoff), anonymizedAt: IsNull() },
    });

    for (const user of expired) {
      const shortId = user.id.slice(0, 8);
      user.username = `deleted_user_${shortId}`;
      user.email = null;
      user.phone = null;
      user.name = TOMBSTONE_NAME;
      user.dateOfBirth = null;
      user.role = null;
      user.passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_SALT_ROUNDS);
      user.anonymizedAt = new Date();
      await this.userRepo.save(user);
      this.logger.log(`Anonymized account ${user.id} (past grace window)`);
    }

    return expired.length;
  }
}
