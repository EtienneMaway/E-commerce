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

  @ApiPropertyOptional({ description: 'User id of whichever party requested termination' })
  @Column({ name: 'termination_requested_by', type: 'uuid', nullable: true })
  terminationRequestedBy: string | null;

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
