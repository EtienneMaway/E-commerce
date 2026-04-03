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

  async getRate(): Promise<ExchangeRate | null> {
    const [rate] = await this.rateRepo.find({ take: 1 });
    return rate ?? null;
  }

  async setRate(dto: SetRateDto): Promise<ExchangeRate> {
    const rate = new Decimal(dto.usdToFcRate);
    if (rate.lte(0)) {
      throw new BadRequestException('Exchange rate must be greater than zero');
    }

    const [existing] = await this.rateRepo.find({ take: 1 });

    if (dto.sellingRate !== undefined) {
      const selling = new Decimal(dto.sellingRate);
      if (selling.lte(0)) {
        throw new BadRequestException('Selling rate must be greater than zero');
      }
    }

    if (existing) {
      existing.usdToFcRate = rate.toFixed(4);
      if (dto.sellingRate !== undefined) {
        existing.sellingRate = new Decimal(dto.sellingRate).toFixed(4);
      }
      return this.rateRepo.save(existing);
    }

    const record = this.rateRepo.create({
      usdToFcRate: rate.toFixed(4),
      sellingRate: dto.sellingRate ? new Decimal(dto.sellingRate).toFixed(4) : null,
    });
    return this.rateRepo.save(record);
  }
}
