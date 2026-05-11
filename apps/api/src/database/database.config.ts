import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import {
  User,
  InventoryEntry,
  SupplierDebt,
  DebtorCredit,
  Payment,
  SaleTransaction,
  ConsignmentRequest,
  ConsignmentItem,
  ExchangeRate,
  ExternalContact,
  ExternalTransaction,
  StockMovement,
  Expense,
  Withdrawal,
  Employment,
  ProductPrice,
  SalaryPayment,
} from '../entities';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    InventoryEntry,
    SupplierDebt,
    DebtorCredit,
    Payment,
    SaleTransaction,
    ConsignmentRequest,
    ConsignmentItem,
    ExchangeRate,
    ExternalContact,
    ExternalTransaction,
    StockMovement,
    Expense,
    Withdrawal,
    Employment,
    ProductPrice,
    SalaryPayment,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: false,
});
