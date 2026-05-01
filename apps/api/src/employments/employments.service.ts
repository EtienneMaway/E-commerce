import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import {
  Employment,
  EmploymentStatus,
  EmploymentTier,
  User,
} from '../entities';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import { CreateEmploymentDto } from './dto/create-employment.dto';
import { CreateMiniEmployeeDto } from './dto/create-mini-employee.dto';
import { EmploymentFilterDto, EmploymentRoleFilter } from './dto/employment-filter.dto';

const OPEN_STATUSES: EmploymentStatus[] = [
  EmploymentStatus.PENDING,
  EmploymentStatus.ACTIVE,
  EmploymentStatus.TERMINATION_REQUESTED,
];

export interface CreateMiniEmployeeResult {
  employment: Employment;
  employee: { id: string; username: string; name: string };
  pairingCode: string;
}

@Injectable()
export class EmploymentsService {
  constructor(
    @InjectRepository(Employment)
    private readonly employmentRepo: Repository<Employment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ─── Employer: create a hire request for an existing user ────────────────

  async create(employerId: string, dto: CreateEmploymentDto): Promise<Employment> {
    const employee = await this.resolveEmployee(dto);

    if (employee.id === employerId) {
      throw new BadRequestException('You cannot hire yourself');
    }
    if (employee.isMiniEmployee) {
      throw new BadRequestException('That account is a mini employee — use the mini-employee flow');
    }

    await this.assertNoOpenEmployment(employee.id);

    const employment = this.employmentRepo.create({
      employerId,
      employeeId: employee.id,
      tier: dto.tier,
      status: EmploymentStatus.PENDING,
    });
    return this.employmentRepo.save(employment);
  }

  // ─── Employer: create a mini employee + active employment in one step ────

  async createMiniEmployee(
    employerId: string,
    dto: CreateMiniEmployeeDto,
  ): Promise<CreateMiniEmployeeResult> {
    if (dto.phone) {
      const phoneTaken = await this.userRepo.findOne({ where: { phone: dto.phone } });
      if (phoneTaken) throw new ConflictException('Phone already registered');
    }

    const username = await this.generateUniqueUsername(dto.name);
    const pairingCode = generatePairingCode();
    const passwordHash = await bcrypt.hash(pairingCode, BCRYPT_SALT_ROUNDS);

    const user = this.userRepo.create({
      username,
      email: null,
      phone: dto.phone ?? null,
      passwordHash,
      isMiniEmployee: true,
    });
    const savedUser = await this.userRepo.save(user);

    const employment = this.employmentRepo.create({
      employerId,
      employeeId: savedUser.id,
      tier: EmploymentTier.SALES_ONLY,
      status: EmploymentStatus.ACTIVE,
      acceptedAt: new Date(),
    });
    const savedEmployment = await this.employmentRepo.save(employment);

    return {
      employment: savedEmployment,
      employee: { id: savedUser.id, username: savedUser.username, name: dto.name },
      pairingCode,
    };
  }

  // ─── List with filters ───────────────────────────────────────────────────

  async list(userId: string, filter: EmploymentFilterDto): Promise<Employment[]> {
    const qb = this.employmentRepo
      .createQueryBuilder('emp')
      .leftJoinAndSelect('emp.employer', 'employer')
      .leftJoinAndSelect('emp.employee', 'employee')
      .orderBy('emp.createdAt', 'DESC');

    if (filter.role === EmploymentRoleFilter.EMPLOYER) {
      qb.where('emp.employerId = :userId', { userId });
    } else if (filter.role === EmploymentRoleFilter.EMPLOYEE) {
      qb.where('emp.employeeId = :userId', { userId });
    } else {
      qb.where('emp.employerId = :userId OR emp.employeeId = :userId', { userId });
    }

    if (filter.status) {
      qb.andWhere('emp.status = :status', { status: filter.status });
    }

    return qb.getMany();
  }

  async findOne(userId: string, id: string): Promise<Employment> {
    const employment = await this.employmentRepo.findOne({
      where: { id },
      relations: { employer: true, employee: true },
    });
    if (!employment) throw new NotFoundException('Employment not found');
    if (employment.employerId !== userId && employment.employeeId !== userId) {
      throw new ForbiddenException('You are not part of this employment');
    }
    return employment;
  }

  // ─── State transitions ───────────────────────────────────────────────────

  async accept(userId: string, id: string): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.employeeId !== userId) {
      throw new ForbiddenException('Only the employee can accept this request');
    }
    if (employment.status !== EmploymentStatus.PENDING) {
      throw new BadRequestException('Employment is not pending');
    }
    // Re-check no other open employment race
    const conflict = await this.employmentRepo.findOne({
      where: {
        employeeId: userId,
        status: In([EmploymentStatus.ACTIVE, EmploymentStatus.TERMINATION_REQUESTED]),
      },
    });
    if (conflict) {
      throw new ConflictException('You already have an active employment');
    }

    employment.status = EmploymentStatus.ACTIVE;
    employment.acceptedAt = new Date();
    return this.employmentRepo.save(employment);
  }

  async reject(userId: string, id: string): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.employeeId !== userId) {
      throw new ForbiddenException('Only the employee can reject this request');
    }
    if (employment.status !== EmploymentStatus.PENDING) {
      throw new BadRequestException('Employment is not pending');
    }
    employment.status = EmploymentStatus.REJECTED;
    return this.employmentRepo.save(employment);
  }

  async requestTermination(userId: string, id: string): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.status !== EmploymentStatus.ACTIVE) {
      throw new BadRequestException('Only active employments can be terminated');
    }
    employment.status = EmploymentStatus.TERMINATION_REQUESTED;
    employment.terminationRequestedBy = userId;
    return this.employmentRepo.save(employment);
  }

  async approveTermination(userId: string, id: string): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.status !== EmploymentStatus.TERMINATION_REQUESTED) {
      throw new BadRequestException('No termination request pending');
    }
    if (employment.terminationRequestedBy === userId) {
      throw new ForbiddenException('The party who requested termination cannot approve it');
    }
    employment.status = EmploymentStatus.TERMINATED;
    employment.terminatedAt = new Date();
    return this.employmentRepo.save(employment);
  }

  async cancelTermination(userId: string, id: string): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.status !== EmploymentStatus.TERMINATION_REQUESTED) {
      throw new BadRequestException('No termination request pending');
    }
    if (employment.terminationRequestedBy !== userId) {
      throw new ForbiddenException('Only the party who requested termination can cancel it');
    }
    employment.status = EmploymentStatus.ACTIVE;
    employment.terminationRequestedBy = null;
    return this.employmentRepo.save(employment);
  }

  async rejectTermination(userId: string, id: string): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.status !== EmploymentStatus.TERMINATION_REQUESTED) {
      throw new BadRequestException('No termination request pending');
    }
    if (employment.terminationRequestedBy === userId) {
      throw new ForbiddenException('The party who requested termination cannot reject their own request');
    }
    employment.status = EmploymentStatus.ACTIVE;
    employment.terminationRequestedBy = null;
    return this.employmentRepo.save(employment);
  }

  // ─── Helpers used by other modules ───────────────────────────────────────

  /** Returns the single open employment row where this user is the employee, or null. */
  async findActiveAsEmployee(employeeId: string): Promise<Employment | null> {
    return this.employmentRepo.findOne({
      where: {
        employeeId,
        status: In([EmploymentStatus.ACTIVE, EmploymentStatus.TERMINATION_REQUESTED]),
      },
      relations: { employer: true },
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async resolveEmployee(dto: CreateEmploymentDto): Promise<User> {
    if (dto.employeeUserId) {
      const user = await this.userRepo.findOne({ where: { id: dto.employeeUserId } });
      if (!user) throw new NotFoundException('Employee user not found');
      return user;
    }
    if (!dto.emailOrPhone) {
      throw new BadRequestException('Provide employeeUserId or emailOrPhone');
    }
    const user = await this.userRepo.findOne({
      where: [{ email: dto.emailOrPhone }, { phone: dto.emailOrPhone }],
    });
    if (!user) throw new NotFoundException('Employee user not found');
    return user;
  }

  private async assertNoOpenEmployment(employeeId: string): Promise<void> {
    const open = await this.employmentRepo.findOne({
      where: { employeeId, status: In(OPEN_STATUSES) },
    });
    if (open) {
      throw new ConflictException('Employee already has an open employment');
    }
  }

  private async generateUniqueUsername(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 16) || 'mini';
    for (let attempt = 0; attempt < 8; attempt++) {
      const suffix = randomBytes(3).toString('hex');
      const candidate = `${base}_${suffix}`;
      const exists = await this.userRepo.findOne({ where: { username: candidate } });
      if (!exists) return candidate;
    }
    throw new ConflictException('Could not generate a unique username — try again');
  }
}

function generatePairingCode(): string {
  // 10-char base32-ish code, easy to read aloud — excludes ambiguous chars.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
