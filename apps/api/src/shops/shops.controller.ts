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
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';
import { RequiresService } from '../common/decorators/requires-service.decorator';
import { CurrentActorContext } from '../common/decorators/current-actor-context.decorator';
import type { ActorContext } from '../common/types/actor-context';

@ApiTags('shops')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('shops')
export class ShopsController {
  constructor(private readonly service: ShopsService) {}

  @Get()
  @AllowedFor('OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE')
  @ApiOperation({
    summary: 'Branches the caller can see',
    description:
      'Deliberately carries no @RequiresService: an employee must be able to see which branch they are in, the same way they can always see their own salary. They get exactly their own — never the list of the others.',
  })
  @ApiResponse({ status: 200 })
  list(@CurrentActorContext() ctx: ActorContext) {
    return this.service.list(ctx);
  }

  @Get(':id')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({ summary: 'One branch' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  findOne(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(ctx, id);
  }

  @Post()
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({ summary: 'Open a new branch' })
  @ApiResponse({ status: 409, description: 'A branch with this name already exists' })
  create(@CurrentActorContext() ctx: ActorContext, @Body() dto: CreateShopDto) {
    return this.service.create(ctx, dto);
  }

  @Patch(':id')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({ summary: 'Rename a branch or change its details and receipt lines' })
  update(
    @CurrentActorContext() ctx: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopDto,
  ) {
    return this.service.update(ctx, id, dto);
  }

  @Patch(':id/default')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({
    summary: 'Make this the default branch',
    description:
      'The branch a request with no X-Shop-Id header resolves to — which is every older mobile install.',
  })
  setDefault(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.setDefault(ctx, id);
  }

  @Patch(':id/archive')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({
    summary: 'Close a branch',
    description: 'Its history stays readable forever; nothing can be written to it again.',
  })
  @ApiResponse({ status: 409, description: 'Still the default, or still has employees' })
  archive(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(ctx, id);
  }

  @Patch(':id/unarchive')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @ApiOperation({ summary: 'Reopen a closed branch' })
  unarchive(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.unarchive(ctx, id);
  }

  @Delete(':id')
  @AllowedFor('OWNER')
  @RequiresService('shops.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a branch created by mistake',
    description:
      'Refused as soon as the branch holds any record — closing it is the real path.',
  })
  @ApiResponse({ status: 409, description: 'This branch has records' })
  remove(@CurrentActorContext() ctx: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(ctx, id);
  }
}
