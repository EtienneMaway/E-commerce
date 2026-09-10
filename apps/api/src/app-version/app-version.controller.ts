import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppVersionService } from './app-version.service';
import { AppVersionQueryDto } from './dto/app-version-query.dto';
import { AppVersionResponseDto } from './dto/app-version-response.dto';

/**
 * Public on purpose: an install too old to log in still has to be told to
 * update, and the answer contains nothing private.
 */
@ApiTags('app-version')
@Controller('app-version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get()
  @ApiOperation({ summary: 'Latest published mobile version and whether the caller should update' })
  @ApiResponse({ status: 200, type: AppVersionResponseDto })
  check(@Query() query: AppVersionQueryDto): AppVersionResponseDto {
    return this.appVersionService.check(query.platform ?? 'android', query.version, query.build);
  }
}
