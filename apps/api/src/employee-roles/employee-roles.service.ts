import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeRole, Employment, EmploymentStatus } from '../entities';
import {
  ROLE_PRESETS,
  RolePreset,
  SERVICE_CATALOG,
  SERVICE_GROUPS,
  ServiceDefinition,
  ServiceKey,
  expandServices,
} from '../common/services/service-catalog';
import { CreateEmployeeRoleDto } from './dto/create-employee-role.dto';
import { UpdateEmployeeRoleDto } from './dto/update-employee-role.dto';

export interface ServiceCatalogResponse {
  groups: readonly string[];
  services: readonly ServiceDefinition[];
  presets: readonly RolePreset[];
}

/** A role plus how many employments currently use it — drives the "in use" badge. */
export interface EmployeeRoleWithUsage extends EmployeeRole {
  assignedCount: number;
}

@Injectable()
export class EmployeeRolesService {
  constructor(
    @InjectRepository(EmployeeRole)
    private readonly roleRepo: Repository<EmployeeRole>,
    @InjectRepository(Employment)
    private readonly employmentRepo: Repository<Employment>,
  ) {}

  /**
   * The catalogue the role editor renders. Static data, but served from the API
   * so the two clients cannot drift from what the guard actually enforces —
   * they supply only the labels.
   */
  getCatalog(): ServiceCatalogResponse {
    return {
      groups: SERVICE_GROUPS,
      services: SERVICE_CATALOG,
      presets: ROLE_PRESETS,
    };
  }

  async list(ownerId: string): Promise<EmployeeRoleWithUsage[]> {
    const roles = await this.roleRepo.find({
      where: { ownerId },
      order: { name: 'ASC' },
    });
    if (roles.length === 0) return [];

    // One grouped count instead of a query per role.
    const counts = await this.countAssignments(roles.map((r) => r.id));
    return roles.map((role) => ({
      ...role,
      assignedCount: counts.get(role.id) ?? 0,
    }));
  }

  async findOne(ownerId: string, id: string): Promise<EmployeeRole> {
    const role = await this.roleRepo.findOne({ where: { id, ownerId } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(ownerId: string, dto: CreateEmployeeRoleDto): Promise<EmployeeRole> {
    const name = dto.name.trim();
    await this.assertNameFree(ownerId, name, null);
    const role = this.roleRepo.create({
      ownerId,
      name,
      description: dto.description?.trim() || null,
      services: this.normalizeServices(dto.services),
    });
    return this.roleRepo.save(role);
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateEmployeeRoleDto,
  ): Promise<EmployeeRole> {
    const role = await this.findOne(ownerId, id);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.assertNameFree(ownerId, name, id);
      role.name = name;
    }
    if (dto.description !== undefined) {
      role.description = dto.description?.trim() || null;
    }
    if (dto.services !== undefined) {
      role.services = this.normalizeServices(dto.services);
    }
    // Saved edits take effect on the employee's very next request — the guard
    // reads the role per request and holds no cache.
    return this.roleRepo.save(role);
  }

  /**
   * Deleting a role that is still assigned is refused rather than cascading the
   * employments to `role_id = NULL`, because NULL means "the tier's default
   * access" — wider than any role. A cascade would quietly *grant* access as a
   * side effect of tidying up. The employer reassigns first.
   */
  async remove(ownerId: string, id: string): Promise<void> {
    const role = await this.findOne(ownerId, id);
    const assigned = (await this.countAssignments([id])).get(id) ?? 0;
    if (assigned > 0) {
      throw new ConflictException(
        `This role is still assigned to ${assigned} employee(s) — move them to another role first`,
      );
    }
    await this.roleRepo.remove(role);
  }

  /** Employments that count as "using" a role: the open ones. */
  private async countAssignments(roleIds: string[]): Promise<Map<string, number>> {
    const rows = await this.employmentRepo
      .createQueryBuilder('e')
      .select('e.role_id', 'roleId')
      .addSelect('COUNT(*)', 'count')
      .where('e.role_id IN (:...roleIds)', { roleIds })
      .andWhere('e.status IN (:...statuses)', {
        statuses: [EmploymentStatus.PENDING, EmploymentStatus.ACTIVE, EmploymentStatus.TERMINATION_REQUESTED],
      })
      .groupBy('e.role_id')
      .getRawMany<{ roleId: string; count: string }>();
    return new Map(rows.map((r) => [r.roleId, Number(r.count)]));
  }

  private async assertNameFree(
    ownerId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    // Matches the case-insensitive unique index; checked here so the employer
    // gets a readable 409 rather than a driver-level constraint error.
    const clash = await this.roleRepo
      .createQueryBuilder('r')
      .where('r.owner_id = :ownerId', { ownerId })
      .andWhere('LOWER(r.name) = LOWER(:name)', { name })
      .andWhere(exceptId ? 'r.id != :exceptId' : '1=1', { exceptId })
      .getOne();
    if (clash) {
      throw new ConflictException(`You already have a role named "${clash.name}"`);
    }
  }

  /**
   * Store the expanded set, so `employee_roles.services` is the whole truth of
   * what the role grants — an employer reading the row (or the role editor
   * re-opening it) sees the implied reads that were added, rather than a list
   * that silently means more than it says.
   */
  private normalizeServices(services: readonly string[]): ServiceKey[] {
    return [...expandServices(services)].sort();
  }
}
