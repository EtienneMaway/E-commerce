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
import { Employment } from './employment.entity';

export enum SalaryPaymentStatus {
  /** Employer recorded the payment; awaiting employee confirmation that they received the cash. */
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  /** Employee confirmed receipt — payment counts toward salary paid. */
  CONFIRMED = 'CONFIRMED',
  /** Employee disputed receipt — payment does not count toward salary paid. */
  REJECTED = 'REJECTED',
  /** Employer cancelled the recorded payment before confirmation. */
  CANCELLED = 'CANCELLED',
}

@Entity('salary_payments')
@Index('idx_salary_payments_employment', ['employmentId'])
@Index('idx_salary_payments_employee_status', ['employeeId', 'status'])
@Index('idx_salary_payments_employer_period', ['employerId', 'periodMonth'])
export class SalaryPayment {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employment_id', type: 'uuid' })
  employmentId: string;

  @ManyToOne(() => Employment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employment_id' })
  employment: Employment;

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

  @ApiProperty({ example: '50.00', description: 'Payment amount in USD' })
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @ApiProperty({
    example: '2026-05',
    description: 'Salary period this payment is allocated to (YYYY-MM)',
  })
  @Column({ name: 'period_month', type: 'varchar', length: 7 })
  periodMonth: string;

  @ApiProperty({ enum: SalaryPaymentStatus })
  @Column({ type: 'enum', enum: SalaryPaymentStatus })
  status: SalaryPaymentStatus;

  @ApiPropertyOptional({ example: 'May installment #1' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @ApiPropertyOptional({ example: 'Cash never received' })
  @Column({ name: 'rejection_reason', type: 'varchar', nullable: true })
  rejectionReason: string | null;

  @ApiProperty({ description: 'When the employer recorded this payment' })
  @Column({ name: 'paid_at', type: 'timestamp' })
  paidAt: Date;

  @ApiPropertyOptional()
  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @ApiPropertyOptional()
  @Column({ name: 'rejected_at', type: 'timestamp', nullable: true })
  rejectedAt: Date | null;

  @ApiPropertyOptional()
  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
