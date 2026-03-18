import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { ConsignmentItem } from './consignment-item.entity';

export enum ConsignmentStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Entity('consignment_requests')
export class ConsignmentRequest {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ enum: ConsignmentStatus, example: ConsignmentStatus.PENDING })
  @Column({ type: 'enum', enum: ConsignmentStatus, default: ConsignmentStatus.PENDING })
  status: ConsignmentStatus;

  @ApiPropertyOptional({ example: 'Please confirm when received' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Supplier (the one sending goods)
  @Column({ name: 'supplier_id' })
  supplierId: string;

  @ManyToOne(() => User, (user) => user.outgoingConsignments)
  @JoinColumn({ name: 'supplier_id' })
  supplier: User;

  // Debtor (the one receiving goods)
  @Column({ name: 'debtor_id' })
  debtorId: string;

  @ManyToOne(() => User, (user) => user.incomingConsignments)
  @JoinColumn({ name: 'debtor_id' })
  debtor: User;

  @OneToMany(() => ConsignmentItem, (item) => item.consignmentRequest, { cascade: true })
  items: ConsignmentItem[];
}
