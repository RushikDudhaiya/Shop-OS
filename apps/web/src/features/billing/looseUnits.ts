/** Loose / weighable units — qty can be fractional (e.g. 0.25 kg). */
const LOOSE_UNITS = new Set([
  "kg",
  "g",
  "gm",
  "gram",
  "grams",
  "l",
  "lt",
  "ltr",
  "liter",
  "litre",
  "ml",
]);

/** Pack / piece labels that still may be sold loose by weight. */
const PACK_UNITS = new Set(["bag", "packet", "pack", "pkt", "piece", "pcs", "pc"]);

/** Kirana staples often sold by weight even if unit left as piece. */
const STAPLE_HINT =
  /\b(dal|daal|toor|moong|chana|masoor|rice|chawal|sugar|chini|atta|flour|wheat|gehu|onion|pyaz|pyaaz|tomato|tamatar|aloo|potato|salt|namak|haldi|mirchi|jeera|oil|tel)\b/i;

const WEIGHT_IN_NAME =
  /(\d+(?:[.,]\d+)?)\s*(kg|g|gm|grams?)\b/i;
const VOLUME_IN_NAME =
  /(\d+(?:[.,]\d+)?)\s*(ml|l|ltr|litres?|liters?)\b/i;

export function isLooseUnit(unit: string): boolean {
  return LOOSE_UNITS.has((unit || "").trim().toLowerCase());
}

export type LooseFamily = "weight" | "volume";

export function looseFamily(unit: string): LooseFamily {
  const u = (unit || "").trim().toLowerCase();
  if (
    u === "l" ||
    u === "lt" ||
    u === "ltr" ||
    u === "liter" ||
    u === "litre" ||
    u === "ml"
  ) {
    return "volume";
  }
  return "weight";
}

export type LooseProduct = {
  name: string;
  unit: string;
  sellingPrice: number;
};

/**
 * Decide if product needs "Kitna chahiye?" sheet, and how to price/qty.
 * Handles: unit=kg, unit=bag + "Rice 5kg", plain "Dal" with piece, etc.
 */
export function resolveLooseSale(p: LooseProduct): {
  loose: boolean;
  /** Unit for picker math + cart display (kg / g / L / ml) */
  billingUnit: string;
  /** Price per 1 billingUnit */
  pricePerBillingUnit: number;
  /**
   * Convert billing qty → quantity stored on sale/cart
   * (product stock unit: e.g. bag of 5kg → 0.25kg becomes 0.05 bag).
   */
  toStockQty: (billingQty: number) => number;
  /** Reverse: stock qty → billing qty for edit sheet */
  toBillingQty: (stockQty: number) => number;
} {
  const unit = (p.unit || "piece").trim().toLowerCase();
  const name = p.name || "";

  const weightMatch = name.match(WEIGHT_IN_NAME);
  const volumeMatch = name.match(VOLUME_IN_NAME);

  // True weight/volume unit on product
  if (isLooseUnit(unit)) {
    return {
      loose: true,
      billingUnit: normalizeUnit(unit),
      pricePerBillingUnit: p.sellingPrice,
      toStockQty: (q) => q,
      toBillingQty: (q) => q,
    };
  }

  // "Rice 5kg" priced per bag → bill per kg, stock in bag fractions
  if (weightMatch) {
    const amount = parseNum(weightMatch[1]);
    const label = weightMatch[2].toLowerCase();
    const packKg = label.startsWith("g") ? amount / 1000 : amount;
    if (packKg > 0 && (PACK_UNITS.has(unit) || !isLooseUnit(unit))) {
      return {
        loose: true,
        billingUnit: "kg",
        pricePerBillingUnit: p.sellingPrice / packKg,
        toStockQty: (billingKg) => billingKg / packKg,
        toBillingQty: (stockQty) => stockQty * packKg,
      };
    }
  }

  if (volumeMatch) {
    const amount = parseNum(volumeMatch[1]);
    const label = volumeMatch[2].toLowerCase();
    const packL = label === "ml" ? amount / 1000 : amount;
    if (packL > 0 && (PACK_UNITS.has(unit) || !isLooseUnit(unit))) {
      return {
        loose: true,
        billingUnit: "L",
        pricePerBillingUnit: p.sellingPrice / packL,
        toStockQty: (billingL) => billingL / packL,
        toBillingQty: (stockQty) => stockQty * packL,
      };
    }
  }

  // "Dal", "Onion" etc. — assume price is per kg
  if (STAPLE_HINT.test(name) && PACK_UNITS.has(unit)) {
    return {
      loose: true,
      billingUnit: "kg",
      pricePerBillingUnit: p.sellingPrice,
      toStockQty: (q) => q,
      toBillingQty: (q) => q,
    };
  }

  return {
    loose: false,
    billingUnit: unit,
    pricePerBillingUnit: p.sellingPrice,
    toStockQty: (q) => q,
    toBillingQty: (q) => q,
  };
}

export function isLooseProduct(p: Pick<LooseProduct, "name" | "unit">): boolean {
  return resolveLooseSale({
    name: p.name,
    unit: p.unit,
    sellingPrice: 1,
  }).loose;
}

function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "gm" || u === "gram" || u === "grams") return "g";
  if (u === "lt" || u === "ltr" || u === "liter" || u === "litre") return "L";
  if (u === "l") return "L";
  return u;
}

function parseNum(raw: string): number {
  return Number(raw.replace(",", "."));
}

/** Base unit for storage math: kg or liter (canonical). */
export function toCanonicalQty(
  unit: string,
  amount: number,
  inputUnit: "base" | "small",
): number {
  const family = looseFamily(unit);
  const u = unit.trim().toLowerCase();
  if (family === "weight") {
    const kg = inputUnit === "small" ? amount / 1000 : amount;
    if (u === "g" || u === "gm" || u === "gram" || u === "grams") return kg * 1000;
    return kg;
  }
  const liters = inputUnit === "small" ? amount / 1000 : amount;
  if (u === "ml") return liters * 1000;
  return liters;
}

/** Human label for cart qty in billing unit. */
export function formatLooseQty(qty: number, unit: string): string {
  const u = unit.trim().toLowerCase();
  const family = looseFamily(unit);
  if (family === "weight") {
    if (u === "g" || u === "gm" || u === "gram" || u === "grams") {
      return `${trimNum(qty)} g`;
    }
    if (qty > 0 && qty < 1) return `${trimNum(qty * 1000)} g`;
    return `${trimNum(qty)} kg`;
  }
  if (u === "ml") return `${trimNum(qty)} ml`;
  if (qty > 0 && qty < 1) return `${trimNum(qty * 1000)} ml`;
  return `${trimNum(qty)} L`;
}

function trimNum(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
}

export type QuickAmount = {
  label: string;
  amount: number;
  inputUnit: "base" | "small";
};

export function quickAmountsFor(unit: string): QuickAmount[] {
  if (looseFamily(unit) === "volume") {
    return [
      { label: "100 ml", amount: 100, inputUnit: "small" },
      { label: "250 ml", amount: 250, inputUnit: "small" },
      { label: "500 ml", amount: 500, inputUnit: "small" },
      { label: "1 L", amount: 1, inputUnit: "base" },
      { label: "1.5 L", amount: 1.5, inputUnit: "base" },
      { label: "2 L", amount: 2, inputUnit: "base" },
    ];
  }
  return [
    { label: "100 g", amount: 100, inputUnit: "small" },
    { label: "250 g", amount: 250, inputUnit: "small" },
    { label: "500 g", amount: 500, inputUnit: "small" },
    { label: "750 g", amount: 750, inputUnit: "small" },
    { label: "1 kg", amount: 1, inputUnit: "base" },
    { label: "2 kg", amount: 2, inputUnit: "base" },
  ];
}
