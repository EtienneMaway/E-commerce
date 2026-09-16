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
import { ConsignmentTeamMember } from './consignment-team-member.entity';

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

  @ApiPropertyOptional({
    example: '2700.0000',
    description:
      "System exchange rate (FC per USD) captured when the products were given. Locks the FC value of this consignment's agreed prices so a later rate change never moves the agreement — carried onto the recipient's CONSIGNED_IN lot and every sale made from it.",
  })
  @Column({ name: 'usd_to_fc_rate_snapshot', type: 'decimal', precision: 14, scale: 4, nullable: true })
  usdToFcRateSnapshot: string | null;

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

  /**
   * A consignment crosses the boundary between two businesses, so it names a
   * full tenancy pair per side rather than replacing one `owner_id` (§3.3).
   * The supplier pair is set at creation; the debtor pair only on confirm,
   * because the receiving merchant is the only one who knows which of *their*
   * branches the goods are arriving at (business rule 7).
   */
  @Column({ name: 'supplier_org_id', type: 'uuid' })
  supplierOrgId: string;

  @Column({ name: 'supplier_shop_id', type: 'uuid' })
  supplierShopId: string;

  @Column({ name: 'debtor_org_id', type: 'uuid', nullable: true })
  debtorOrgId: string | null;

  @Column({ name: 'debtor_shop_id', type: 'uuid', nullable: true })
  debtorShopId: string | null;

  @ManyToOne(() => User, (user) => user.incomingConsignments)
  @JoinColumn({ name: 'debtor_id' })
  debtor: User;

  @OneToMany(() => ConsignmentItem, (item) => item.consignmentRequest, { cascade: true })
  items: ConsignmentItem[];

  /**
   * Optional people teaming up with the recipient on this batch — a record of
   * who was out with the goods between this give and the handover that closes
   * the cycle. Never referenced by the ledger.
   */
  @OneToMany(() => ConsignmentTeamMember, (m) => m.consignmentRequest, { cascade: true })
  teamMembers: ConsignmentTeamMember[];
}
