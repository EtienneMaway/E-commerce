import { PartialType } from '@nestjs/swagger';
import { CreateShopDto } from './create-shop.dto';

/** Every field optional; `isDefault` and `archivedAt` have their own endpoints. */
export class UpdateShopDto extends PartialType(CreateShopDto) {}
