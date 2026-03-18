// ─── Enums ───────────────────────────────────────────────────────────────────

export enum InventorySource {
  PERSONAL = 'PERSONAL',
  SUPPLIER = 'SUPPLIER',
  CONSIGNED_OUT = 'CONSIGNED_OUT',
  CONSIGNED_IN = 'CONSIGNED_IN',
}

export enum ConsignmentStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentDirection {
  OWNER_TO_SUPPLIER = 'OWNER_TO_SUPPLIER',
  DEBTOR_TO_OWNER = 'DEBTOR_TO_OWNER',
}

// ─── Core Entities ───────────────────────────────────────────────────────────
// Note: date fields are ISO 8601 strings (e.g. "2025-01-15T10:30:00.000Z")
// because JSON serialization converts Date objects to strings. The API entities
// use TypeORM Date objects internally; these interfaces represent the serialized form.

export interface User {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export interface InventoryEntry {
  id: string;
  source: InventorySource;
  productName: string;
  unitCost: string;       // decimal string — never use number for money
  sellingPrice: string;
  category: string | null;
  quantityOriginal: number;
  quantityRemaining: number;
  createdAt: string;
  ownerId: string;
  supplierUserId: string | null;
  supplierUser?: Pick<User, 'id' | 'username'>;
  debtorUserId: string | null;
  debtorUser?: Pick<User, 'id' | 'username'>;
}

export interface SupplierDebt {
  id: string;
  ownerId: string;
  supplierUserId: string;
  supplierUser: Pick<User, 'id' | 'username'>;
  totalCreditReceived: string;
  totalPaid: string;
  outstandingBalance: string;
  createdAt: string;
  updatedAt: string;
  payments?: Payment[];
  inventoryEntries?: InventoryEntry[];
}

export interface DebtorCredit {
  id: string;
  ownerId: string;
  debtorUserId: string;
  debtorUser: Pick<User, 'id' | 'username'>;
  totalCreditGiven: string;
  totalReceived: string;
  outstandingBalance: string;
  createdAt: string;
  updatedAt: string;
  payments?: Payment[];
  inventoryEntries?: InventoryEntry[];
}

export interface Payment {
  id: string;
  amount: string;
  note: string | null;
  date: string;
  direction: PaymentDirection;
  remainingBalance: string;
  supplierDebtId: string | null;
  debtorCreditId: string | null;
}

export interface ConsignmentItem {
  id: string;
  productName: string;
  quantity: number;
  agreedUnitPrice: string;
  unitCost: string;
  consignmentRequestId: string;
}

export interface ConsignmentRequest {
  id: string;
  status: ConsignmentStatus;
  note: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplierId: string;
  supplier?: Pick<User, 'id' | 'username'>;
  debtorId: string;
  debtor?: Pick<User, 'id' | 'username'>;
  items: ConsignmentItem[];
}

export interface SaleTransaction {
  id: string;
  productName: string;
  // CONSIGNED_OUT entries are not sold directly — only PERSONAL and SUPPLIER stock can be sold
  source: 'PERSONAL' | 'SUPPLIER';
  supplierUserId: string | null;
  qtySold: number;
  unitCost: string;
  salePrice: string;
  profit: string;
  isLoss: boolean;
  date: string;
  ownerId: string;
  inventoryEntryId: string;
}

// ─── API Request DTOs ─────────────────────────────────────────────────────────

export interface RegisterDto {
  username: string;
  email?: string;
  phone?: string;
  password: string;
}

export interface LoginDto {
  emailOrPhone: string;
  password: string;
}

export interface AddPersonalProductDto {
  productName: string;
  unitCost: string;
  sellingPrice: string;
  quantity: number;
  category?: string;
}

export interface ReceiveFromSupplierDto {
  supplierUserId: string;
  productName: string;
  unitCost: string;       // Agreed price to pay supplier per unit
  sellingPrice: string;
  quantity: number;
  category?: string;
}

export interface ConsignToDebtorDto {
  debtorUserId: string;
  productName: string;    // Must match an existing inventory product (case-insensitive)
  quantity: number;
  agreedUnitPrice: string;
}

export interface CreateConsignmentItemDto {
  productName: string;
  quantity: number;
  agreedUnitPrice: string;
}

export interface CreateConsignmentDto {
  debtorUserId: string;
  note?: string;
  items: CreateConsignmentItemDto[];
}

export interface RecordSaleDto {
  productName: string;
  qtySold: number;
  salePrice: string;
  confirmedOverride?: boolean; // Required true when selling below cost
}

export interface PaySupplierDto {
  supplierUserId: string;
  amount: string;
  note?: string;
}

export interface RecordDebtorPaymentDto {
  debtorUserId: string;
  amount: string;
  note?: string;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface PriceGuardWarning {
  warning: true;
  costPrice: string;
  potentialLoss: string;
  message: string;
}

export interface DashboardSummary {
  totalIOwe: string;         // Sum of all SupplierDebt.outstandingBalance
  totalOwedToMe: string;     // Sum of all DebtorCredit.outstandingBalance
  netPosition: string;       // totalOwedToMe - totalIOwe
  totalProfitAllTime: string; // Sum of all SaleTransaction.profit
}

export interface TopProduct {
  productName: string;
  totalQtySold: number;
  totalRevenue: string;
  totalProfit: string;
  isLossProduct: boolean;
}

export interface SupplierDetailView {
  supplierUser: Pick<User, 'id' | 'username'>;
  debt: SupplierDebt;
  productsReceived: InventoryEntry[];
  totalValueSold: string;
  payments: Payment[];
}

export interface DebtorDetailView {
  debtorUser: Pick<User, 'id' | 'username'>;
  credit: DebtorCredit;
  productsConsigned: InventoryEntry[];
  payments: Payment[];
}

// ─── Query Params ─────────────────────────────────────────────────────────────

export type TopProductsRankBy = 'qty' | 'revenue' | 'profit';
export type SalesPeriod = 'today' | 'week' | 'month' | 'custom';
