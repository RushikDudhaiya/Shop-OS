/**
 * Resolve clean catalog-style product images.
 * Priority: barcode (Open Food Facts packshot) → name search → null (UI uses category art).
 */

type OffProduct = {
  image_front_small_url?: string;
  image_front_url?: string;
  image_small_url?: string;
  image_url?: string;
  product_name?: string;
};

function pickImage(p: OffProduct | null | undefined): string | null {
  if (!p) return null;
  return (
    p.image_front_small_url ||
    p.image_small_url ||
    p.image_front_url ||
    p.image_url ||
    null
  );
}

export async function suggestProductImage(opts: {
  name?: string;
  barcode?: string | null;
}): Promise<string | null> {
  const barcode = opts.barcode?.trim();
  if (barcode && /^\d{8,14}$/.test(barcode)) {
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
        {
          headers: { "User-Agent": "ShopOS/0.1 (kirana-pos; local-dev)" },
          signal: AbortSignal.timeout(6000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { product?: OffProduct };
        const url = pickImage(data.product);
        if (url) return url;
      }
    } catch {
      /* fall through */
    }
  }

  const name = opts.name?.trim();
  if (!name || name.length < 2) return null;

  // Skip pure price quick-items
  if (/^₹?\d/.test(name)) return null;

  try {
    const params = new URLSearchParams({
      search_terms: name,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "8",
      fields: "product_name,image_front_small_url,image_small_url,image_front_url,image_url",
    });
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?${params}`,
      {
        headers: { "User-Agent": "ShopOS/0.1 (kirana-pos; local-dev)" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { products?: OffProduct[] };
    const products = data.products ?? [];
    const needle = name.toLowerCase();
    const ranked = [...products].sort((a, b) => {
      const an = (a.product_name || "").toLowerCase();
      const bn = (b.product_name || "").toLowerCase();
      const as = an.includes(needle) || needle.includes(an.slice(0, 6)) ? 0 : 1;
      const bs = bn.includes(needle) || needle.includes(bn.slice(0, 6)) ? 0 : 1;
      return as - bs;
    });
    for (const p of ranked) {
      const url = pickImage(p);
      if (url) return url;
    }
  } catch {
    return null;
  }

  return null;
}
