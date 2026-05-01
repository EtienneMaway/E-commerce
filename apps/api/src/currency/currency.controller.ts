import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { CurrencyService } from './currency.service';
import { SetRateDto } from './dto/set-rate.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowedFor } from '../common/decorators/allowed-for.decorator';

@ApiTags('currency')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get('rate')
  @ApiOperation({ summary: 'Get the current system-wide USD → FC exchange rate' })
  @ApiResponse({ status: 200, description: 'Current exchange rate' })
  @ApiResponse({ status: 404, description: 'No rate set yet' })
  async getRate() {
    const rate = await this.currencyService.getRate();
    if (!rate) throw new NotFoundException('Exchange rate has not been set');
    return {
      usdToFcRate: rate.usdToFcRate,
      sellingRate: rate.sellingRate,
      updatedAt: rate.updatedAt,
    };
  }

  @Put('rate')
  @AllowedFor('OWNER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or update the system-wide USD → FC exchange rate' })
  @ApiBody({ type: SetRateDto })
  @ApiResponse({ status: 200, description: 'Rate saved' })
  @ApiResponse({ status: 400, description: 'Rate must be greater than zero' })
  async setRate(@Body() dto: SetRateDto) {
    const rate = await this.currencyService.setRate(dto);
    return {
      usdToFcRate: rate.usdToFcRate,
      sellingRate: rate.sellingRate,
      updatedAt: rate.updatedAt,
    };
  }
}
