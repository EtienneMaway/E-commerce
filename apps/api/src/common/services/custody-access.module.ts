import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockCustody } from '../../entities';
import { CustodyAccessService } from './custody-access.service';

/**
 * Global for the same reason `ShopsModule` is: `JwtAuthGuard` and the
 * `/auth/me` DTO need `CustodyAccessService` from almost every other module.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StockCustody])],
  providers: [CustodyAccessService],
  exports: [CustodyAccessService],
})
export class CustodyAccessModule {}
