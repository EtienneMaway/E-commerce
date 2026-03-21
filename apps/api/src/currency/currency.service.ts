import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { ExchangeRate } from '../entities/exchange-rate.entity';
import { SetRateDto } from './dto/set-rate.dto';

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(ExchangeRate)
    private readonly rateRepo: Repository<ExchangeRate>,
  ) {}

  async getRate(ownerId: string): Promise<ExchangeRate | null> {
    return this.rateRepo.findOne({ where: { ownerId } });
  }

  async setRate(ownerId: string, dto: SetRateDto): Promise<ExchangeRate> {
    const rate = new Decimal(dto.usdToFcRate);
    if (rate.lte(0)) {
      throw new BadRequestException('Exchange rate must be greater than zero');
    }

    const existing = await this.rateRepo.findOne({ where: { ownerId } });

    if (existing) {
      existing.usdToFcRate = rate.toFixed(4);
      return this.rateRepo.save(existing);
    }

    const record = this.rateRepo.create({
      ownerId,
      usdToFcRate: rate.toFixed(4),
    });
    return this.rateRepo.save(record);
  }
}
