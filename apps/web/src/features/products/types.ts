export type Product = {
  _id: string;
  shopId: string;
  name: string;
  sellingPrice: number;
  purchasePrice?: number | null;
  trackStock: boolean;
  minStock?: number | null;
  isFavorite: boolean;
  active: boolean;
  availableStock: number | null;
  unit: string;
  barcode?: string | null;
  /** Optional photo URL — phone camera / upload later */
  imageUrl?: string | null;
};

export type ProductListResponse = {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  suggestions: Product[];
};

export type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  trackStock: boolean;
  unit: string;
  imageUrl?: string | null;
};
