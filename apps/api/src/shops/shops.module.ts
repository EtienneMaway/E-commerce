import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employment, Organization, Shop, User } from '../entities';
import { ShopContextService } from './shop-context.service';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Global for the same reason `EmploymentsModule` is: `JwtAuthGuard` is applied
 * with `@UseGuards` on 21 controllers across as many modules, and it needs this
 * service in every one of them.
 *
 * Phase 3 added the shops and organizations controllers beside it.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Organization, Shop, User, Employment])],
  controllers: [ShopsController, OrganizationsController],
  providers: [ShopContextService, ShopsService, OrganizationsService],
  exports: [ShopContextService, ShopsService, OrganizationsService],
})
export class ShopsModule {}
