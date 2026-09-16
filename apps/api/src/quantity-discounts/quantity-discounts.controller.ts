import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QuantityDiscountsService } from './quantity-discounts.service';
import { UpdateQuantityDiscountDto } from './dto/update-quantity-discount.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('quantity-discounts')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('quantity-discounts')
export class QuantityDiscountsController {
  constructor(private readonly service: QuantityDiscountsService) {}

  @Get()
  @RequiresService('inventory.view')
  // Every tier that can record a sale needs to read the tiers to compute the
  // discount at checkout — mini employees included (they sell on their own
  // books). The default allowlist (OWNER/FULL_EMPLOYEE) would 403 a mini.
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({
    summary: "Get the shop's quantity-discount tiers",
    description:
      'Returns the enabled flag and the three tier percentages (half dozen / ' +
      'dozen / carton). Returns a zeroed, disabled default when none is set.',
  })
  @ApiResponse({ status: 200, description: 'Quantity-discount config' })
  get(@CurrentActorContext() ctx: ActorContext) {
    // Tiers are a branch-wide setting. The mini special case this used to carry
    // is gone: `effectiveOwnerId` is still the mini themselves (the consigned
    // stock is on their books), but `orgId` is already the employer's business,
    // so the ordinary tenancy filter reads the right config for every tier.
    return this.service.get(ctx);
  }

  @Put()
  @AllowedFor('OWNER', 'FULL_EMPLOYEE')
  @RequiresService('pricing.catalog')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set or update the shop's quantity-discount tiers" })
  @ApiBody({ type: UpdateQuantityDiscountDto })
  @ApiResponse({ status: 200, description: 'Config saved' })
  update(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: UpdateQuantityDiscountDto,
  ) {
    return this.service.upsert(ctx, dto);
  }
}
