import { api } from "@/lib/api";
import type { Product, ProductListResponse } from "@/features/products/types";

/** Exact barcode match only — avoids fuzzy name hits on scan. */
export async function findProductByBarcode(
  shopId: string,
  code: string,
): Promise<Product | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const data = await api<ProductListResponse>(
    `/api/shops/${shopId}/products?q=${encodeURIComponent(trimmed)}&pageSize=20`,
  );
  return (
    data.items.find((p) => (p.barcode ?? "").trim() === trimmed) ?? null
  );
}
