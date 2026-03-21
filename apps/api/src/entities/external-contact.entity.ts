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
import { ExternalTransaction } from './external-transaction.entity';

export enum ExternalContactRole {
  DEBTOR = 'DEBTOR',
  SUPPLIER = 'SUPPLIER',
  BOTH = 'BOTH',
}

@Entity('external_contacts')
export class ExternalContact {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Jean Dupont' })
  @Column()
  name: string;

  @ApiPropertyOptional({ example: '+243812345678' })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'Market vendor, pays on Fridays' })
  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @ApiProperty({ enum: ExternalContactRole, example: ExternalContactRole.DEBTOR })
  @Column({ type: 'enum', enum: ExternalContactRole, default: ExternalContactRole.DEBTOR })
  role: ExternalContactRole;

  @ApiProperty({ example: '150.00', description: 'Amount this contact owes you (debtor side)' })
  @Column({ name: 'debtor_balance', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  debtorBalance: string;

  @ApiProperty({ example: '75.00', description: 'Amount you owe this contact (supplier side)' })
  @Column({ name: 'supplier_balance', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  supplierBalance: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => ExternalTransaction, (tx) => tx.contact, { cascade: true })
  transactions: ExternalTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
