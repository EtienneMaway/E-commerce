import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { ActorContext } from '../common/types/actor-context';
import type { User } from '../entities';

/**
 * The business itself — what the merchant sees as "Business" / "Entreprise".
 * There is no POST and no DELETE: an organization is created with the account
 * and handed on rather than closed, so the only lifecycle verbs are edit and
 * transfer.
 */
@ApiTags('organizations')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get('me')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({ summary: 'The business this account runs' })
  findMine(@CurrentActorContext() ctx: ActorContext) {
    return this.service.findMine(ctx);
  }

  @Patch('me')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({ summary: 'Edit the business name, tax id or receipt logo' })
  update(@CurrentActorContext() ctx: ActorContext, @Body() dto: UpdateOrganizationDto) {
    return this.service.update(ctx, dto);
  }

  @Get('me/ownership-history')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({ summary: 'Who has owned this business, and when it changed hands' })
  history(@CurrentActorContext() ctx: ActorContext) {
    return this.service.ownershipHistory(ctx);
  }

  // ─── Transfer ─────────────────────────────────────────────────────────────

  @Post('me/transfer')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({
    summary: 'Offer the business to another account',
    description:
      'They must accept. The business keeps trading meanwhile — a nominee accepts a live business, not a frozen one.',
  })
  @ApiResponse({ status: 409, description: 'Nominee is closed or is an employee profile' })
  propose(@CurrentActorContext() ctx: ActorContext, @Body() dto: TransferOwnershipDto) {
    return this.service.proposeTransfer(ctx, dto);
  }

  @Delete('me/transfer')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({ summary: 'Withdraw an offer that has not been accepted' })
  cancel(@CurrentActorContext() ctx: ActorContext) {
    return this.service.cancelTransfer(ctx);
  }

  /**
   * The nominee's three endpoints carry no `@RequiresService`, on purpose: they
   * are about this person's own account, not about running someone's business.
   * A manager offered the shop may hold no services at all.
   */
  @Get('offers')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({ summary: 'Businesses being offered to me' })
  offers(@CurrentUser() user: User) {
    return this.service.listOffersTo(user.id);
  }

  @Patch('offers/:orgId/accept')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Accept a business offered to me',
    description:
      'If I was employed by it, that employment ends in the same transaction — otherwise I would be owner and employee of the same business, and the guard would restrict me on my own books.',
  })
  accept(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.acceptTransfer(user.id, orgId);
  }

  @Patch('offers/:orgId/reject')
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Decline a business offered to me' })
  reject(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.rejectTransfer(user.id, orgId);
  }
}
