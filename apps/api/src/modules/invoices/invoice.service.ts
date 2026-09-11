import type { Types } from "mongoose";
import { notFound } from "../../lib/errors.js";
import { CustomerModel } from "../customers/customer.model.js";
import { PaymentModel } from "../payments/payment.model.js";
import { SaleItemModel } from "../sales/sale-item.model.js";
import { SaleModel } from "../sales/sale.model.js";
import { roundMoney } from "../sales/sale.service.js";
import { ShopModel } from "../shops/shop.model.js";

export type InvoicePayload = {
  invoiceNumber: string;
  saleId: string;
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    gstEnabled: boolean;
    gstin: string | null;
    taxLabel: string | null;
    gstRate: number | null;
    billTerms: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
  };
  completedAt: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  payments: Array<{ method: string; amount: number; receivedAt: string | null }>;
  textSummary: string;
};

export async function buildInvoicePayload(
  shopId: Types.ObjectId,
  saleId: Types.ObjectId,
): Promise<InvoicePayload> {
  const [sale, shop] = await Promise.all([
    SaleModel.findOne({ _id: saleId, shopId }),
    ShopModel.findById(shopId),
  ]);
  if (!sale || !shop) throw notFound("Sale not found");

  const [items, payments, customer] = await Promise.all([
    SaleItemModel.find({ saleId }).lean(),
    PaymentModel.find({ saleId, status: "CONFIRMED" }).lean(),
    sale.customerId
      ? CustomerModel.findById(sale.customerId).lean()
      : Promise.resolve(null),
  ]);

  const settings = shop.settings ?? {};
  const taxLabel =
    (settings as { taxLabel?: string }).taxLabel?.trim() ||
    ((settings as { taxType?: string }).taxType === "VAT" ? "VAT" : "GST");
  const gstRate = Number((settings as { gstRate?: number }).gstRate ?? 0) || null;
  const billTerms =
    (settings as { billTerms?: string }).billTerms?.trim() || "Thank you!";
  const customerName = customer?.name ?? "Walk-in Customer";
  const customerPhone = customer?.phone ?? null;

  const lineRows = items.map((i) => ({
    name: i.productNameSnapshot,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
  }));

  const textLines = [
    `*${shop.name}*`,
    `Invoice ${sale.invoiceNumber}`,
    sale.completedAt
      ? `Date: ${sale.completedAt.toLocaleString("en-IN")}`
      : "",
    `Customer: ${customerName}`,
    "---",
    ...lineRows.map(
      (l) =>
        `${l.name} x${l.quantity} = ₹${roundMoney(l.lineTotal)}`,
    ),
    "---",
    `Subtotal: ₹${roundMoney(sale.subtotal)}`,
    sale.discount > 0 ? `Discount: ₹${roundMoney(sale.discount)}` : "",
    sale.tax > 0 ? `${taxLabel}: ₹${roundMoney(sale.tax)}` : "",
    `Total: ₹${roundMoney(sale.total)}`,
    sale.amountDue > 0 ? `Due: ₹${roundMoney(sale.amountDue)}` : "Paid",
    settings.gstEnabled && settings.gstin
      ? `GSTIN: ${settings.gstin}`
      : "",
    billTerms,
  ].filter(Boolean);

  return {
    invoiceNumber: sale.invoiceNumber,
    saleId: String(sale._id),
    shop: {
      name: shop.name,
      address: settings.address ?? null,
      phone: settings.phone ?? null,
      gstEnabled: Boolean(settings.gstEnabled),
      gstin: settings.gstin ?? null,
      taxLabel,
      gstRate,
      billTerms,
    },
    customer: {
      name: customerName,
      phone: customerPhone,
    },
    completedAt: sale.completedAt?.toISOString() ?? null,
    items: lineRows,
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    amountPaid: sale.amountPaid,
    amountDue: sale.amountDue,
    payments: payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      receivedAt: p.receivedAt?.toISOString?.() ?? null,
    })),
    textSummary: textLines.join("\n"),
  };
}

export function whatsappDeepLink(phone: string | null, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const withCountry =
    digits.length === 10 ? `91${digits}` : digits || undefined;
  const encoded = encodeURIComponent(text);
  return withCountry
    ? `https://wa.me/${withCountry}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}
