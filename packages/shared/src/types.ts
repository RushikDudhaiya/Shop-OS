import type {
  InventoryTxType,
  PaymentMethod,
  PaymentStatus,
  Permission,
  Role,
  SaleStatus,
} from "./constants.js";

export type Id = string;

export interface User {
  _id: Id;
  phone: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  isPhoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShopSettings {
  simpleMode: boolean;
  allowNegativeStock: boolean;
  defaultPaymentMethod: PaymentMethod;
  gstEnabled: boolean;
  invoicePrefix?: string;
}

export interface Shop {
  _id: Id;
  name: string;
  businessType?: string;
  ownerUserId: Id;
  currency: "INR";
  settings: ShopSettings;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  _id: Id;
  shopId: Id;
  userId: Id;
  role: Role;
  permissions: Permission[];
  status: "ACTIVE" | "INVITED" | "DISABLED";
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  _id: Id;
  shopId: Id;
  name: string;
  normalizedName: string;
  categoryId?: Id;
  sku?: string;
  barcode?: string;
  unit: string;
  sellingPrice: number;
  purchasePrice?: number;
  mrp?: number;
  trackStock: boolean;
  minStock?: number;
  isFavorite?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  _id: Id;
  shopId: Id;
  invoiceNumber: string;
  customerId?: Id;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  createdBy: Id;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  _id: Id;
  saleId: Id;
  productId: Id;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  unitCostSnapshot?: number;
  discount: number;
  tax: number;
  lineTotal: number;
}

export interface Payment {
  _id: Id;
  shopId: Id;
  saleId?: Id;
  customerId?: Id;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  reference?: string;
  receivedAt: string;
  createdBy: Id;
  createdAt: string;
}

export interface Customer {
  _id: Id;
  shopId: Id;
  name: string;
  phone?: string;
  notes?: string;
  creditLimit?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  _id: Id;
  shopId: Id;
  productId: Id;
  type: InventoryTxType;
  quantityDelta: number;
  sourceType: string;
  sourceId?: Id;
  unitCost?: number;
  note?: string;
  createdBy: Id;
  createdAt: string;
}

export interface DashboardSummary {
  todaySalesTotal: number;
  todaySalesCount: number;
  monthSalesTotal: number;
  estimatedProfit?: number;
  profitCoveragePct?: number;
  lowStockCount: number;
  udhaarOutstanding: number;
  expensesTotal: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
