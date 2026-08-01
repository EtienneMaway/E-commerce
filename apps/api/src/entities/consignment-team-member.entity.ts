import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsignmentRequest } from './consignment-request.entity';

/**
 * An optional teammate the recipient (typically a mini employee) will be selling
 * with for this batch of goods — recorded purely so the owner knows who was out
 * with the products between the give and the handover that closes the cycle.
 *
 * Deliberately NOT a `User`: these are people off the books (a helper, a cousin,
 * a porter), captured as a name and an optional phone. They carry no
 * permissions, no stock and no money — nothing in the ledger references them.
 */
@Entity('consignment_team_members')
@Index('idx_consignment_team_members_request', ['consignmentRequestId'])
export class ConsignmentTeamMember {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Jean Kabila' })
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @ApiPropertyOptional({ example: '+243 990 000 000' })
  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ name: 'consignment_request_id' })
  consignmentRequestId: string;

  @ManyToOne(() => ConsignmentRequest, (req) => req.teamMembers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'consignment_request_id' })
  consignmentRequest: ConsignmentRequest;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
