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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { UpdatePricingDto, UpsertPricingDto } from './dto/upsert-pricing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('pricing')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@AllowedFor('OWNER')
@Controller('pricing')
export class PricingController {
  constructor(private readonly service: PricingService) {}

  @Get()
  @ApiOperation({ summary: 'List standard prices for the current owner' })
  @ApiResponse({ status: 200 })
  list(@CurrentActorContext() ctx: ActorContext) {
    return this.service.list(ctx.effectiveOwnerId);
  }

  @Post()
  @ApiOperation({ summary: 'Set or update a product\'s standard unit price' })
  @ApiResponse({ status: 201 })
  upsert(@CurrentActorContext() ctx: ActorContext, @Body() dto: UpsertPricingDto) {
    return this.service.upsert(ctx.effectiveOwnerId, dto.productName, dto.unitPrice);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing standard price' })
  update(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePricingDto,
  ) {
    return this.service.update(ctx.effectiveOwnerId, id, dto.unitPrice);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a standard price entry' })
  remove(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(ctx.effectiveOwnerId, id);
  }
}
