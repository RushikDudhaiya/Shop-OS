import type { BusinessType } from "./constants.js";

export type CatalogItem = {
  name: string;
  unit: string;
  sellingPrice?: number;
  trackStock?: boolean;
};

export type ShopCatalog = {
  placeholders: [string, string, string];
  voiceExamples: string;
  searchPlaceholder: string;
  tapItems: CatalogItem[];
  quickItems: Array<{
    name: string;
    sellingPrice: number;
    trackStock: boolean;
  }>;
};

const KIRANA: ShopCatalog = {
  placeholders: ["Jaise Parle-G", "Jaise Maggi", "Jaise Sugar"],
  voiceExamples: "“Parle-G das rupaye” · “Dal chalees”",
  searchPlaceholder: "Filter… jaise Maggi, oil",
  tapItems: [
    { name: "Parle-G", unit: "piece" },
    { name: "Maggi", unit: "piece" },
    { name: "Bread", unit: "piece" },
    { name: "Milk", unit: "piece" },
    { name: "Sugar", unit: "kg" },
    { name: "Rice", unit: "kg" },
    { name: "Dal", unit: "kg" },
    { name: "Oil", unit: "L" },
    { name: "Onion", unit: "kg" },
    { name: "Tomato", unit: "kg" },
    { name: "Soap", unit: "piece" },
    { name: "Biscuit", unit: "piece" },
  ],
  quickItems: [
    { name: "₹1 Toffee", sellingPrice: 1, trackStock: false },
    { name: "₹2 Chocolate", sellingPrice: 2, trackStock: false },
    { name: "₹5 Biscuit", sellingPrice: 5, trackStock: false },
    { name: "₹10 Snack", sellingPrice: 10, trackStock: false },
  ],
};

const HARDWARE: ShopCatalog = {
  placeholders: ["Jaise Screw 1 inch", "Jaise Hammer", "Jaise PVC Pipe"],
  voiceExamples: "“Screw bees rupaye” · “Hammer do sau”",
  searchPlaceholder: "Filter… jaise screw, pipe, paint",
  tapItems: [
    { name: "Screw 1 inch", unit: "piece" },
    { name: "Nail 2 inch", unit: "piece" },
    { name: "Hammer", unit: "piece" },
    { name: "Screwdriver", unit: "piece" },
    { name: "PVC Pipe 1 inch", unit: "piece" },
    { name: "Elbow Joint", unit: "piece" },
    { name: "Tap", unit: "piece" },
    { name: "Lock", unit: "piece" },
    { name: "Hinge", unit: "piece" },
    { name: "Paint Brush", unit: "piece" },
    { name: "Fevicol 100g", unit: "piece" },
    { name: "Sandpaper", unit: "piece" },
    { name: "Wire 1mm", unit: "m" },
    { name: "Switch", unit: "piece" },
    { name: "Socket", unit: "piece" },
    { name: "Bulb LED", unit: "piece" },
  ],
  quickItems: [
    { name: "Screw pack", sellingPrice: 10, trackStock: true },
    { name: "Nail pack", sellingPrice: 20, trackStock: true },
    { name: "Washer", sellingPrice: 5, trackStock: true },
    { name: "Cable tie", sellingPrice: 15, trackStock: true },
  ],
};

const ELECTRICAL: ShopCatalog = {
  placeholders: ["Jaise LED Bulb", "Jaise Switch", "Jaise Wire 1mm"],
  voiceExamples: "“Bulb pachas rupaye” · “Switch tees”",
  searchPlaceholder: "Filter… jaise bulb, switch, wire",
  tapItems: [
    { name: "LED Bulb 9W", unit: "piece" },
    { name: "Tube Light", unit: "piece" },
    { name: "Switch", unit: "piece" },
    { name: "Socket", unit: "piece" },
    { name: "Wire 1mm", unit: "m" },
    { name: "MCB", unit: "piece" },
    { name: "Holder", unit: "piece" },
    { name: "Extension Board", unit: "piece" },
    { name: "Fan Regulator", unit: "piece" },
    { name: "Door Bell", unit: "piece" },
  ],
  quickItems: [
    { name: "LED Bulb", sellingPrice: 50, trackStock: true },
    { name: "Switch", sellingPrice: 30, trackStock: true },
    { name: "Socket", sellingPrice: 40, trackStock: true },
    { name: "Holder", sellingPrice: 25, trackStock: true },
  ],
};

const STATIONERY: ShopCatalog = {
  placeholders: ["Jaise Notebook", "Jaise Pen", "Jaise A4 Paper"],
  voiceExamples: "“Notebook pachas” · “Pen das rupaye”",
  searchPlaceholder: "Filter… jaise pen, notebook",
  tapItems: [
    { name: "Notebook", unit: "piece" },
    { name: "Pen", unit: "piece" },
    { name: "Pencil", unit: "piece" },
    { name: "Eraser", unit: "piece" },
    { name: "A4 Paper ream", unit: "piece" },
    { name: "Glue stick", unit: "piece" },
    { name: "Scale", unit: "piece" },
    { name: "Sharpener", unit: "piece" },
  ],
  quickItems: [
    { name: "Pen", sellingPrice: 10, trackStock: true },
    { name: "Pencil", sellingPrice: 5, trackStock: true },
    { name: "Eraser", sellingPrice: 5, trackStock: true },
    { name: "Notebook", sellingPrice: 40, trackStock: true },
  ],
};

const COSMETICS: ShopCatalog = {
  placeholders: ["Jaise Face Cream", "Jaise Shampoo", "Jaise Soap"],
  voiceExamples: "“Shampoo do sau” · “Soap tees”",
  searchPlaceholder: "Filter… jaise cream, shampoo",
  tapItems: [
    { name: "Face Cream", unit: "piece" },
    { name: "Shampoo", unit: "piece" },
    { name: "Soap", unit: "piece" },
    { name: "Powder", unit: "piece" },
    { name: "Lipstick", unit: "piece" },
    { name: "Hair Oil", unit: "piece" },
  ],
  quickItems: [
    { name: "Soap", sellingPrice: 30, trackStock: true },
    { name: "Shampoo sachet", sellingPrice: 5, trackStock: true },
    { name: "Face wash", sellingPrice: 80, trackStock: true },
    { name: "Hair oil", sellingPrice: 60, trackStock: true },
  ],
};

const BAKERY: ShopCatalog = {
  placeholders: ["Jaise Bread", "Jaise Cake slice", "Jaise Bun"],
  voiceExamples: "“Bread chalees” · “Bun das”",
  searchPlaceholder: "Filter… jaise bread, cake",
  tapItems: [
    { name: "Bread", unit: "piece" },
    { name: "Bun", unit: "piece" },
    { name: "Cake slice", unit: "piece" },
    { name: "Cookies", unit: "piece" },
    { name: "Puff", unit: "piece" },
  ],
  quickItems: [
    { name: "Bun", sellingPrice: 10, trackStock: true },
    { name: "Puff", sellingPrice: 20, trackStock: true },
    { name: "Bread", sellingPrice: 40, trackStock: true },
    { name: "Cookie pack", sellingPrice: 30, trackStock: true },
  ],
};

const GIFT: ShopCatalog = {
  placeholders: ["Jaise Greeting card", "Jaise Soft toy", "Jaise Frame"],
  voiceExamples: "“Card pachas” · “Frame do sau”",
  searchPlaceholder: "Filter… jaise card, frame, toy",
  tapItems: [
    { name: "Greeting card", unit: "piece" },
    { name: "Soft toy", unit: "piece" },
    { name: "Photo frame", unit: "piece" },
    { name: "Gift wrap", unit: "piece" },
    { name: "Mug", unit: "piece" },
  ],
  quickItems: [
    { name: "Greeting card", sellingPrice: 50, trackStock: true },
    { name: "Gift wrap", sellingPrice: 30, trackStock: true },
    { name: "Keychain", sellingPrice: 40, trackStock: true },
    { name: "Mug", sellingPrice: 150, trackStock: true },
  ],
};

const ACCESSORY: ShopCatalog = {
  placeholders: ["Jaise Phone cover", "Jaise Earphones", "Jaise Charger"],
  voiceExamples: "“Cover do sau” · “Charger teen sau”",
  searchPlaceholder: "Filter… jaise cover, charger",
  tapItems: [
    { name: "Phone cover", unit: "piece" },
    { name: "Earphones", unit: "piece" },
    { name: "Charger", unit: "piece" },
    { name: "Cable", unit: "piece" },
    { name: "Tempered glass", unit: "piece" },
  ],
  quickItems: [
    { name: "Cable", sellingPrice: 100, trackStock: true },
    { name: "Phone cover", sellingPrice: 150, trackStock: true },
    { name: "Tempered glass", sellingPrice: 100, trackStock: true },
    { name: "Earphones", sellingPrice: 200, trackStock: true },
  ],
};

const OTHER: ShopCatalog = {
  placeholders: ["Jaise Item 1", "Jaise Item 2", "Product naam"],
  voiceExamples: "“Item bees rupaye” · “Samaan pachas”",
  searchPlaceholder: "Product search…",
  tapItems: [
    { name: "Item A", unit: "piece" },
    { name: "Item B", unit: "piece" },
    { name: "Item C", unit: "piece" },
    { name: "Item D", unit: "piece" },
  ],
  quickItems: [
    { name: "Fast item ₹10", sellingPrice: 10, trackStock: false },
    { name: "Fast item ₹20", sellingPrice: 20, trackStock: false },
    { name: "Fast item ₹50", sellingPrice: 50, trackStock: false },
    { name: "Fast item ₹100", sellingPrice: 100, trackStock: false },
  ],
};

const BY_TYPE: Record<BusinessType, ShopCatalog> = {
  kirana: KIRANA,
  hardware: HARDWARE,
  electrical: ELECTRICAL,
  stationery: STATIONERY,
  cosmetics: COSMETICS,
  bakery: BAKERY,
  gift: GIFT,
  accessory: ACCESSORY,
  other: OTHER,
};

export function getShopCatalog(
  businessType?: string | null,
): ShopCatalog {
  if (businessType && businessType in BY_TYPE) {
    return BY_TYPE[businessType as BusinessType];
  }
  return OTHER;
}
