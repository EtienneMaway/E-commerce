import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { EmployeeRole } from './employee-role.entity';

export enum EmploymentTier {
  /** Dashboard + mobile login. Permitted: direct sales, send consignments, give to external contacts, accept debtor payments, register external-contact payments, register expenses. */
  FULL = 'FULL',
  /** Mobile-only mini-employee. Permitted: direct sales only. */
  SALES_ONLY = 'SALES_ONLY',
}

export enum EmploymentStatus {
  /** Employer sent a request, awaiting employee acceptance. (Skipped for mini employees — they go straight to ACTIVE.) */
  PENDING = 'PENDING',
  /** Active employment — employee operates on employer's books. */
  ACTIVE = 'ACTIVE',
  /** Employee rejected the original request. */
  REJECTED = 'REJECTED',
  /** Either party requested termination; awaiting counterparty approval. Employee continues to operate normally during this state. */
  TERMINATION_REQUESTED = 'TERMINATION_REQUESTED',
  /** Counterparty approved termination — relationship is over. */
  TERMINATED = 'TERMINATED',
}

@Entity('employments')
export class Employment {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employer_id', type: 'uuid' })
  employerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employer_id' })
  employer: User;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: User;

  @ApiProperty({ enum: EmploymentTier })
  @Column({ type: 'enum', enum: EmploymentTier })
  tier: EmploymentTier;

  @ApiProperty({ enum: EmploymentStatus })
  @Column({ type: 'enum', enum: EmploymentStatus })
  status: EmploymentStatus;

  @ApiPropertyOptional({
    description:
      "The employer-defined role that decides which services this employee can use, on the dashboard and on mobile. Null means unrestricted for the tier — the behaviour every employment had before roles existed, and still the default for a new hire until the employer assigns one. A role can only NARROW what the tier already permits; it can never widen it.",
  })
  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId: string | null;

  @ManyToOne(() => EmployeeRole, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role: EmployeeRole | null;

  @ApiPropertyOptional({ description: 'User id of whichever party requested termination' })
  @Column({ name: 'termination_requested_by', type: 'uuid', nullable: true })
  terminationRequestedBy: string | null;

  @ApiPropertyOptional({ example: '300.00', description: 'Target monthly pay in USD — null until set by the employer' })
  @Column({ name: 'monthly_pay', type: 'decimal', precision: 14, scale: 4, nullable: true })
  monthlyPay: string | null;

  @ApiProperty({
    example: true,
    description: 'When false, the employer cannot record new salary payments (used to pause payroll without terminating)',
  })
  @Column({ name: 'payroll_active', type: 'boolean', default: true })
  payrollActive: boolean;

  @ApiProperty({
    example: '2.00',
    description:
      "The share of what the employee has SOLD that they may spend on expenses, as a percentage. For a mini (SALES_ONLY) the base is what they sold this handover cycle; for a full employee it is what they personally sold that calendar day (resets daily). Someone who has sold 100 with a 5% allowance can claim up to 5 in expenses, and the ceiling grows as they sell more. Always applies — defaults to 2%; an employer wanting effectively no limit sets a high percentage.",
  })
  @Column({ name: 'expense_allowance_pct', type: 'decimal', precision: 5, scale: 2, default: '2.00' })
  expenseAllowancePct: string;

  @ApiPropertyOptional({
    example: '10.00',
    description:
      'Mini employees only, optional: commission the employer pays the mini, as a percentage of the sold value of each APPROVED handover. Sealed onto each handover at approval, so it accrues only from handovers approved after it was set, and a later change never rewrites past handovers. Null = no commission (monthly pay only). Can be combined with monthlyPay.',
  })
  @Column({ name: 'commission_pct', type: 'decimal', precision: 5, scale: 2, nullable: true })
  commissionPct: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiPropertyOptional()
  @Column({ name: 'accepted_at', type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @ApiPropertyOptional()
  @Column({ name: 'terminated_at', type: 'timestamp', nullable: true })
  terminatedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
