import { z } from "zod";
import {
  BUSINESS_TYPES,
  EXPENSE_CATEGORIES,
  INVENTORY_TX_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PERMISSIONS,
  ROLES,
  SALE_STATUSES,
} from "./constants.js";

export const objectIdSchema = z.string().min(1);

export const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const moneySchema = z.number().finite().nonnegative();

export const shopSettingsSchema = z.object({
  simpleMode: z.boolean().default(true),
  allowNegativeStock: z.boolean().default(false),
  defaultPaymentMethod: z.enum(PAYMENT_METHODS).default("CASH"),
  gstEnabled: z.boolean().default(false),
  invoicePrefix: z.string().max(12).optional(),
  gstin: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(15).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  billTerms: z.string().trim().max(1000).optional(),
  askCustomerName: z.boolean().default(true),
  taxType: z.enum(["GST", "VAT", "NONE"]).default("GST"),
  gstRate: z.number().min(0).max(100).optional(),
  taxLabel: z.string().trim().max(40).optional(),
  enabledPaymentMethods: z.array(z.enum(PAYMENT_METHODS)).optional(),
  logoUrl: z.string().trim().max(500_000).optional(),
});

export const updateShopSettingsSchema = shopSettingsSchema.partial();

export const updateShopProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
});

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(120),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  settings: shopSettingsSchema.partial().optional(),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  categoryId: objectIdSchema.optional(),
  sku: z.string().trim().max(64).optional(),
  barcode: z.string().trim().max(64).optional(),
  unit: z.string().trim().min(1).max(32).default("piece"),
  sellingPrice: moneySchema,
  purchasePrice: moneySchema.optional(),
  mrp: moneySchema.optional(),
  trackStock: z.boolean().default(true),
  minStock: z.number().int().nonnegative().optional(),
  openingStock: z.number().nonnegative().optional(),
  isFavorite: z.boolean().optional().default(false),
  /** http(s) URL or small data:image thumbnail */
  imageUrl: z.string().trim().max(500_000).optional(),
});

export const updateProductSchema = createProductSchema
  .omit({ openingStock: true })
  .partial()
  .extend({
    active: z.boolean().optional(),
  });

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const saleItemInputSchema = z.object({
  productId: objectIdSchema,
  quantity: z.number().positive(),
  unitPrice: moneySchema.optional(),
  discount: moneySchema.optional().default(0),
  tax: moneySchema.optional().default(0),
});

export const createSaleSchema = z.object({
  customerId: objectIdSchema.optional(),
  /** For udhaar — create/find customer by name+phone if no customerId */
  customer: z
    .object({
      name: z.string().trim().min(1).max(120),
      phone: phoneSchema.optional(),
    })
    .optional(),
  items: z.array(saleItemInputSchema).min(1),
  discount: moneySchema.optional().default(0),
  tax: moneySchema.optional().default(0),
  idempotencyKey: z.string().min(8).max(128).optional(),
  complete: z.boolean().optional().default(true),
  payment: z
    .object({
      method: z.enum(PAYMENT_METHODS),
      /** Amount applied to the bill (not tendered cash) */
      amount: moneySchema.nonnegative().optional(),
      /** Cash tendered by customer — used for change */
      receivedAmount: moneySchema.optional(),
      reference: z.string().trim().max(120).optional(),
    })
    .optional(),
});

export const createPaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: moneySchema.positive(),
  reference: z.string().trim().max(120).optional(),
  receivedAmount: moneySchema.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  creditLimit: moneySchema.optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: moneySchema.positive(),
  paymentMethod: z.enum(["CASH", "UPI", "BANK"] as const).default("CASH"),
  note: z.string().trim().max(500).optional(),
  spentAt: z.coerce.date().optional(),
});

export const inventoryAdjustSchema = z.object({
  productId: objectIdSchema,
  type: z.enum(INVENTORY_TX_TYPES),
  quantityDelta: z.number().finite().refine((n) => n !== 0, "Delta cannot be 0"),
  note: z.string().trim().max(500).optional(),
  unitCost: moneySchema.optional(),
});

export const authStartSchema = z.object({
  phone: phoneSchema,
});

export const authVerifySchema = z.object({
  phone: phoneSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, "Enter a valid OTP"),
  challengeId: z.string().min(1).optional(),
});

export const membershipRoleSchema = z.enum(ROLES);
export const permissionSchema = z.enum(PERMISSIONS);
export const saleStatusSchema = z.enum(SALE_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.array(z.string())).optional(),
});

export type CreateShopInput = z.infer<typeof createShopSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;
export type AuthStartInput = z.infer<typeof authStartSchema>;
export type AuthVerifyInput = z.infer<typeof authVerifySchema>;
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
export type UpdateShopProfileInput = z.infer<typeof updateShopProfileSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
