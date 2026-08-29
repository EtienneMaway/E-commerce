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
  EmployeeRole,
  Employment,
  EmploymentStatus,
  EmploymentTier,
  User,
} from '../entities';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import type { ActorContext } from '../common/types/actor-context';
import { CreateEmploymentDto } from './dto/create-employment.dto';
import { CreateMiniEmployeeDto } from './dto/create-mini-employee.dto';
import { EmploymentFilterDto, EmploymentRoleFilter } from './dto/employment-filter.dto';
import { SetSalaryDto } from './dto/set-salary.dto';
import { SetPayrollActiveDto } from './dto/set-payroll-active.dto';
import { SetExpenseAllowanceDto } from './dto/set-expense-allowance.dto';
import { SetCommissionDto } from './dto/set-commission.dto';
import { CreateExternalEmployeeDto } from './dto/create-external-employee.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';

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

export interface CreateExternalEmployeeResult {
  employment: Employment;
  employee: { id: string; username: string; name: string };
}

@Injectable()
export class EmploymentsService {
  constructor(
    @InjectRepository(Employment)
    private readonly employmentRepo: Repository<Employment>,
    @InjectRepository(EmployeeRole)
    private readonly employeeRoleRepo: Repository<EmployeeRole>,
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
      name: dto.name,
      isMiniEmployee: true,
    });
    const savedUser = await this.userRepo.save(user);

    // Created PENDING: the mini pairs on the mobile app with the code below, then
    // accepts the invite there (→ ACTIVE). Only then do they operate on their own
    // books. Mirrors the full-employee handshake, but stays mobile-only.
    const employment = this.employmentRepo.create({
      employerId,
      employeeId: savedUser.id,
      tier: EmploymentTier.SALES_ONLY,
      status: EmploymentStatus.PENDING,
    });
    const savedEmployment = await this.employmentRepo.save(employment);

    return {
      employment: savedEmployment,
      employee: { id: savedUser.id, username: savedUser.username, name: dto.name },
      pairingCode,
    };
  }

  // ─── Employer: create an external employee (payroll-only, no login) ──────

  async createExternalEmployee(
    employerId: string,
    dto: CreateExternalEmployeeDto,
  ): Promise<CreateExternalEmployeeResult> {
    const username = await this.generateUniqueUsername(dto.name);

    // External employees can't log in. We still need a password_hash for the
    // NOT NULL column — set it to a random unguessable value that's never shared.
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_SALT_ROUNDS);

    const user = this.userRepo.create({
      username,
      email: null,
      phone: null,
      passwordHash,
      name: dto.name,
      dateOfBirth: dto.dateOfBirth ?? null,
      role: dto.role ?? null,
      isMiniEmployee: false,
      isExternalEmployee: true,
    });
    const savedUser = await this.userRepo.save(user);

    const employment = this.employmentRepo.create({
      employerId,
      employeeId: savedUser.id,
      tier: EmploymentTier.SALES_ONLY,
      status: EmploymentStatus.ACTIVE,
      acceptedAt: new Date(),
      monthlyPay: dto.monthlyPay !== undefined ? dto.monthlyPay.toFixed(4) : null,
      payrollActive: true,
    });
    const savedEmployment = await this.employmentRepo.save(employment);

    return {
      employment: savedEmployment,
      employee: { id: savedUser.id, username: savedUser.username, name: dto.name },
    };
  }

  // ─── Employer: remove an external employee (one-step termination) ───────

  async removeExternalEmployee(employerId: string, employmentId: string): Promise<Employment> {
    const employment = await this.employmentRepo.findOne({
      where: { id: employmentId },
      relations: { employee: true },
    });
    if (!employment) throw new NotFoundException('Employment not found');
    if (employment.employerId !== employerId) {
      throw new ForbiddenException('Only the employer can remove this employee');
    }
    if (!employment.employee?.isExternalEmployee) {
      throw new BadRequestException('This endpoint is for external employees only — use the termination flow for internal employees');
    }
    if (employment.status === EmploymentStatus.TERMINATED) {
      throw new BadRequestException('Employee is already removed');
    }
    employment.status = EmploymentStatus.TERMINATED;
    employment.terminatedAt = new Date();
    employment.payrollActive = false;
    return this.employmentRepo.save(employment);
  }

  // ─── Employer: edit the employee's profile (name, dob, role) ─────────────

  async updateEmployeeProfile(
    employerId: string,
    employmentId: string,
    dto: UpdateEmployeeProfileDto,
  ): Promise<User> {
    const employment = await this.employmentRepo.findOne({
      where: { id: employmentId },
      relations: { employee: true },
    });
    if (!employment) throw new NotFoundException('Employment not found');
    if (employment.employerId !== employerId) {
      throw new ForbiddenException('Only the employer can edit this profile');
    }
    const user = employment.employee;
    if (!user) throw new NotFoundException('Employee not found');

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.dateOfBirth !== undefined) {
      user.dateOfBirth = dto.dateOfBirth === '' ? null : dto.dateOfBirth;
    }
    if (dto.role !== undefined) user.role = dto.role === '' ? null : dto.role;

    return this.userRepo.save(user);
  }

  // ─── List with filters ───────────────────────────────────────────────────

  /**
   * A full employee granted `handovers.approve` supervises their employer's mini
   * employees, so they need to see those employments without being party to
   * them. This is the only widening of the employer-or-employee rule, and it is
   * deliberately narrow: mini (SALES_ONLY) rows of that one employer, with pay
   * redacted by {@link redactForSupervisor}.
   */
  private supervisorScope(ctx: ActorContext): string | null {
    return ctx.tier === 'FULL_EMPLOYEE' && ctx.services.has('handovers.approve')
      ? ctx.effectiveOwnerId
      : null;
  }

  /**
   * Strip compensation from an employment the viewer is only supervising. They
   * need to know who the minis are, not what their colleagues are paid.
   */
  private redactForSupervisor(emp: Employment): Employment {
    return Object.assign(emp, { monthlyPay: null, commissionPct: null });
  }

  async list(
    userId: string,
    filter: EmploymentFilterDto,
    ctx?: ActorContext,
  ): Promise<Employment[]> {
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

    const supervisedOwnerId = ctx ? this.supervisorScope(ctx) : null;
    if (supervisedOwnerId) {
      qb.orWhere(
        '(emp.employerId = :supervisedOwnerId AND emp.tier = :miniTier)',
        { supervisedOwnerId, miniTier: EmploymentTier.SALES_ONLY },
      );
    }

    if (filter.status) {
      qb.andWhere('emp.status = :status', { status: filter.status });
    }

    const rows = await qb.getMany();
    if (!supervisedOwnerId) return rows;
    return rows.map((emp) =>
      emp.employerId === userId || emp.employeeId === userId
        ? emp
        : this.redactForSupervisor(emp),
    );
  }

  async findOne(userId: string, id: string, ctx?: ActorContext): Promise<Employment> {
    const employment = await this.employmentRepo.findOne({
      where: { id },
      relations: { employer: true, employee: true },
    });
    if (!employment) throw new NotFoundException('Employment not found');
    if (employment.employerId === userId || employment.employeeId === userId) {
      return employment;
    }
    // Supervisor read: their employer's minis only, pay redacted.
    const supervisedOwnerId = ctx ? this.supervisorScope(ctx) : null;
    if (
      supervisedOwnerId &&
      employment.employerId === supervisedOwnerId &&
      employment.tier === EmploymentTier.SALES_ONLY
    ) {
      return this.redactForSupervisor(employment);
    }
    throw new ForbiddenException('You are not part of this employment');
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

  // ─── Payroll: monthly pay + payroll-active toggle ────────────────────────

  async setSalary(userId: string, id: string, dto: SetSalaryDto): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.employerId !== userId) {
      throw new ForbiddenException('Only the employer can set the salary');
    }
    if (employment.status === EmploymentStatus.REJECTED || employment.status === EmploymentStatus.TERMINATED) {
      throw new BadRequestException('Cannot set salary on a closed employment');
    }
    if (dto.monthlyPay === null || dto.monthlyPay === undefined) {
      employment.monthlyPay = null;
    } else {
      if (dto.monthlyPay < 0) throw new BadRequestException('Monthly pay must be non-negative');
      employment.monthlyPay = dto.monthlyPay.toFixed(4);
    }
    return this.employmentRepo.save(employment);
  }

  async setPayrollActive(userId: string, id: string, dto: SetPayrollActiveDto): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.employerId !== userId) {
      throw new ForbiddenException('Only the employer can change payroll status');
    }
    if (employment.status === EmploymentStatus.REJECTED || employment.status === EmploymentStatus.TERMINATED) {
      throw new BadRequestException('Cannot change payroll status on a closed employment');
    }
    employment.payrollActive = dto.active;
    return this.employmentRepo.save(employment);
  }

  /**
   * Employer sets the share of an employee's sales they may spend on expenses.
   * For a mini (SALES_ONLY) the cap runs over the open handover cycle; for a
   * full employee it runs over each calendar day (resets the next day), against
   * what that employee personally sold that day. Always in force (2% by
   * default), so there is no "clear it" — an employer who wants an employee
   * effectively unrestricted sets a high percentage.
   */
  async setExpenseAllowance(
    userId: string,
    id: string,
    dto: SetExpenseAllowanceDto,
  ): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.employerId !== userId) {
      throw new ForbiddenException('Only the employer can set an expense allowance');
    }
    const value = Number(dto.expenseAllowancePct);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new BadRequestException('Allowance must be between 0 and 100 percent');
    }
    employment.expenseAllowancePct = dto.expenseAllowancePct;
    return this.employmentRepo.save(employment);
  }

  /**
   * Employer sets (or clears) a mini's commission: a percentage of the sold
   * value of each APPROVED handover, paid by the employer on top of — or
   * instead of — a monthly pay. The rate is sealed onto each handover at
   * approval, so it starts counting with the first handover approved after it
   * was set and changing it never rewrites what past handovers earned.
   */
  async setCommission(
    userId: string,
    id: string,
    dto: SetCommissionDto,
  ): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.employerId !== userId) {
      throw new ForbiddenException('Only the employer can set a commission');
    }
    if (employment.tier !== EmploymentTier.SALES_ONLY) {
      throw new BadRequestException('Commission applies to mini employees only — they earn it on handovers');
    }
    if (employment.status === EmploymentStatus.REJECTED || employment.status === EmploymentStatus.TERMINATED) {
      throw new BadRequestException('Cannot set a commission on a closed employment');
    }
    if (dto.commissionPct === null || dto.commissionPct === undefined) {
      employment.commissionPct = null;
    } else {
      employment.commissionPct = dto.commissionPct.toFixed(2);
    }
    return this.employmentRepo.save(employment);
  }

  /**
   * Attach a role to an employment, or clear it with `roleId: null`.
   *
   * Clearing is a WIDENING action, not a tidy-up: no role means the tier's
   * default access, which is broader than most roles. The dashboard should word
   * it as "remove all restrictions", never as "remove access".
   */
  async setRole(userId: string, id: string, roleId: string | null): Promise<Employment> {
    const employment = await this.findOne(userId, id);
    if (employment.employerId !== userId) {
      throw new ForbiddenException('Only the employer can set an employee\'s role');
    }
    if (
      employment.status === EmploymentStatus.REJECTED ||
      employment.status === EmploymentStatus.TERMINATED
    ) {
      throw new BadRequestException('Cannot set a role on a closed employment');
    }
    if (roleId !== null) {
      // Scoped to this employer: one employer must never be able to attach
      // another's role, which would leak the role's name and service list.
      const role = await this.employeeRoleRepo.findOne({
        where: { id: roleId, ownerId: userId },
      });
      if (!role) throw new NotFoundException('Role not found');
    }
    employment.roleId = roleId;
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
      // `role` feeds JwtAuthGuard's @RequiresService check. Joined here rather
      // than fetched separately because the guard already runs this query on
      // every authenticated request — a second round-trip per request would be
      // pure overhead.
      relations: { employer: true, role: true },
    });
  }

  /**
   * Like {@link findActiveAsEmployee} but also matches a PENDING invite. Used by
   * mini-employee pairing: a freshly-created mini is PENDING and must be able to
   * pair (obtain a JWT) so they can accept the invite on the app. The request
   * guard still uses findActiveAsEmployee, so a PENDING mini can't yet operate.
   */
  async findOpenAsEmployee(employeeId: string): Promise<Employment | null> {
    return this.employmentRepo.findOne({
      where: {
        employeeId,
        status: In([
          EmploymentStatus.PENDING,
          EmploymentStatus.ACTIVE,
          EmploymentStatus.TERMINATION_REQUESTED,
        ]),
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
