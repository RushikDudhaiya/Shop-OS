/**
 * Infer a display category from product name/unit.
 * Used when product has no categoryId (Bill chips + Reports chart stay in sync).
 */

const RULES: Array<{ match: RegExp; group: string }> = [
  {
    match: /\b(milk|doodh|amul|paneer|curd|dahi|butter|ghee|cheese|yogurt)\b/i,
    group: "Dairy",
  },
  { match: /\b(bread|pav)\b/i, group: "Dairy" },
  { match: /\b(egg)\b/i, group: "Dairy" },
  {
    match:
      /\b(parle|biscuit|cookie|good day|marie|toffee|tooffee|chocolate|snack|namkeen|chips)\b/i,
    group: "Snacks",
  },
  { match: /\b(maggi|noodles|pasta)\b/i, group: "Snacks" },
  {
    match:
      /\b(cold drink|coke|pepsi|sprite|fanta|limca|maaza|drink|juice|soda)\b/i,
    group: "Beverages",
  },
  { match: /\b(tea|chai|red label|tata tea|coffee)\b/i, group: "Beverages" },
  {
    match: /\b(rice|chawal|basmati|dal|daal|toor|moong|masoor|chana|atta|flour|wheat|gehu|oil|sugar|chini|salt|namak)\b/i,
    group: "Groceries",
  },
  {
    match: /\b(soap|shampoo|wash|detergent|colgate|toothpaste|brush)\b/i,
    group: "Personal Care",
  },
  {
    match: /\b(onion|pyaz|tomato|tamatar|potato|aloo|sabzi|vegetable)\b/i,
    group: "Vegetables",
  },
  {
    match:
      /\b(screw|nail|bolt|nut|washer|hinge|lock|hammer|screwdriver|spanner|plier|tool|pipe|pvc|elbow|tap|valve|paint|brush|fevicol|sandpaper|adhesive|wire|switch|socket|bulb|led|mcb|holder)\b/i,
    group: "Hardware",
  },
];

export function inferProductCategoryGroup(
  name: string,
  unit?: string | null,
): string {
  const n = name.trim();
  if (!n) return "Others";

  for (const rule of RULES) {
    if (rule.match.test(n)) return rule.group;
  }

  const u = (unit || "").trim().toLowerCase();
  if (u === "kg" || u === "g" || u === "gm") return "Groceries";
  if (u === "l" || u === "lt" || u === "ltr" || u === "ml") return "Beverages";

  return "Others";
}
