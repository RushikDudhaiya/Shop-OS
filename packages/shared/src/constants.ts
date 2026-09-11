export const ROLES = [
  "OWNER",
  "MANAGER",
  "CASHIER",
  "INVENTORY_STAFF",
] as const;

export type Role = (typeof ROLES)[number];

export const PAYMENT_METHODS = [
  "CASH",
  "UPI",
  "CARD",
  "CREDIT",
  "BANK_TRANSFER",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SALE_STATUSES = [
  "DRAFT",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "FAILED",
  "REFUNDED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INVENTORY_TX_TYPES = [
  "OPENING_STOCK",
  "PURCHASE_IN",
  "SALE_OUT",
  "SALE_RETURN_IN",
  "PURCHASE_RETURN_OUT",
  "MANUAL_ADJUSTMENT_IN",
  "MANUAL_ADJUSTMENT_OUT",
  "DAMAGE_OUT",
  "STOCK_COUNT_ADJUSTMENT",
] as const;

export type InventoryTxType = (typeof INVENTORY_TX_TYPES)[number];

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Transport",
  "Tea/Food",
  "Salary/Wages",
  "Repairs",
  "Stock Purchase",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const BUSINESS_TYPES = [
  "kirana",
  "stationery",
  "cosmetics",
  "hardware",
  "electrical",
  "bakery",
  "gift",
  "accessory",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

/** Permission keys used for RBAC checks */
export const PERMISSIONS = [
  "sale.create",
  "sale.refund",
  "product.create",
  "product.edit",
  "inventory.adjust",
  "purchase.create",
  "customer.view",
  "customer.credit",
  "report.view",
  "cost.view",
  "expense.create",
  "shop.settings",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  MANAGER: [
    "sale.create",
    "sale.refund",
    "product.create",
    "product.edit",
    "inventory.adjust",
    "purchase.create",
    "customer.view",
    "customer.credit",
    "report.view",
    "cost.view",
    "expense.create",
  ],
  CASHIER: ["sale.create", "customer.view", "customer.credit"],
  INVENTORY_STAFF: [
    "product.create",
    "product.edit",
    "inventory.adjust",
    "purchase.create",
  ],
};

export const APP_NAME = "Shop OS";
export const APP_TAGLINE = "Dukaan chalao. Data entry nahi.";

/** Generic ₹1/₹2 style items — no brand/SKU/GST required */
export const QUICK_ITEMS = [
  { name: "₹1 Toffee", sellingPrice: 1, trackStock: false },
  { name: "₹2 Chocolate", sellingPrice: 2, trackStock: false },
  { name: "₹5 Biscuit", sellingPrice: 5, trackStock: false },
  { name: "₹10 Snack", sellingPrice: 10, trackStock: false },
] as const;

/**
 * Tap-to-pick names for shopkeepers who prefer not to type.
 * Price still set on add (voice / number pad).
 */
export const TAP_CATALOG = [
  { name: "Parle-G", unit: "piece" },
  { name: "Maggi", unit: "piece" },
  { name: "Bread", unit: "piece" },
  { name: "Milk", unit: "piece" },
  { name: "Eggs", unit: "piece" },
  { name: "Tea", unit: "piece" },
  { name: "Sugar", unit: "kg" },
  { name: "Rice", unit: "kg" },
  { name: "Dal", unit: "kg" },
  { name: "Atta", unit: "kg" },
  { name: "Oil", unit: "L" },
  { name: "Salt", unit: "kg" },
  { name: "Onion", unit: "kg" },
  { name: "Tomato", unit: "kg" },
  { name: "Potato", unit: "kg" },
  { name: "Soap", unit: "piece" },
  { name: "Detergent", unit: "piece" },
  { name: "Shampoo", unit: "piece" },
  { name: "Biscuit", unit: "piece" },
  { name: "Namkeen", unit: "piece" },
  { name: "Cold Drink", unit: "piece" },
  { name: "Chips", unit: "piece" },
] as const;

