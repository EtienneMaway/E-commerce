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
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('quantity-discounts')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('quantity-discounts')
export class QuantityDiscountsController {
  constructor(private readonly service: QuantityDiscountsService) {}

  @Get()
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
    // Tiers are a shop-wide setting owned by the OWNER. A full employee's
    // effectiveOwnerId is already the employer, but a mini's effectiveOwnerId is
    // their OWN id (they sell consigned stock on their own books) — so resolve a
    // mini to their employer explicitly, otherwise they'd read an always-empty
    // config and never see the discount their shop configured.
    const configOwnerId =
      ctx.tier === 'MINI_EMPLOYEE' && ctx.employment
        ? ctx.employment.employerId
        : ctx.effectiveOwnerId;
    return this.service.get(configOwnerId);
  }

  @Put()
  @AllowedFor('OWNER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set or update the shop's quantity-discount tiers" })
  @ApiBody({ type: UpdateQuantityDiscountDto })
  @ApiResponse({ status: 200, description: 'Config saved' })
  update(
    @CurrentActorContext() ctx: ActorContext,
    @Body() dto: UpdateQuantityDiscountDto,
  ) {
    return this.service.upsert(ctx.effectiveOwnerId, dto);
  }
}
