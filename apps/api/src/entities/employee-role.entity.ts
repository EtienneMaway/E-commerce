import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';

/**
 * A named bundle of services an employer opens for their employees — reusable
 * across people ("Cashier", "Evening seller"), owned by the employer.
 *
 * Named EmployeeRole rather than Role because `User.role` already exists as a
 * free-text job title for display; the two are unrelated.
 *
 * `Employment.roleId` points here. A null roleId means the employment is
 * unrestricted for its tier (the pre-feature behaviour), so existing rows keep
 * working and restricting someone is an explicit act.
 */
@Entity('employee_roles')
@Index('idx_employee_roles_owner', ['ownerId'])
export class EmployeeRole {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The employer who owns this role. Roles are never shared between employers. */
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @ApiProperty({ example: 'Cashier' })
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @ApiPropertyOptional({ example: 'Sells and records expenses, no access to money screens' })
  @Column({ type: 'varchar', length: 240, nullable: true })
  description: string | null;

  /**
   * Catalog keys from `common/services/service-catalog.ts`. Deliberately typed as
   * `string[]` and not `ServiceKey[]`: a row written before a key was renamed or
   * retired would otherwise be typed as valid. Reads go through
   * `resolveGrantedServices`, which drops anything no longer in the catalog.
   *
   * An empty array is legal and meaningful — login, own salary, and the right to
   * leave the job, nothing else. Useful to suspend someone without terminating.
   */
  @ApiProperty({ example: ['sales.record', 'inventory.view'], type: [String] })
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  services: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
