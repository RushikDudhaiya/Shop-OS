export type PaymentStatus = "paid" | "partial" | "due" | "overdue";

export type CustomerRow = {
  _id: string;
  name: string;
  phone: string | null;
  notes?: string | null;
  outstandingDue: number;
  lastPurchaseAt: string | null;
  lastInvoiceNumber: string | null;
  purchaseCount: number;
  purchaseTotal: number;
};

export type CustomerSummary = {
  totalCustomers: number;
  totalReceivable: number;
  receivableCustomerCount: number;
  overdueAmount: number;
  overdueCustomerCount: number;
  receivedThisMonth: number;
  receivedGrowthPct: number | null;
  newThisMonth: number;
};

export type CustomerListResponse = {
  customers: CustomerRow[];
  summary: CustomerSummary;
};

export type CustomerProfile = {
  _id: string;
  name: string;
  phone: string | null;
  notes?: string | null;
  creditLimit?: number | null;
  createdAt: string | null;
  outstandingDue: number;
  overdueAmount: number;
  purchaseTotal: number;
  purchaseCount: number;
  totalReceived: number;
  paidThisMonth: number;
  receivableInvoices: number;
};

export type CustomerSale = {
  _id: string;
  invoiceNumber: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  completedAt: string | null;
};

export type CustomerPayment = {
  _id: string;
  method: string;
  amount: number;
  reference: string;
  saleId: string | null;
  receivedAt?: string;
};

export type CustomerDetail = {
  customer: CustomerProfile;
  sales: CustomerSale[];
  payments: CustomerPayment[];
};

export type LedgerEntry = {
  id: string;
  type: "invoice" | "payment";
  number: string;
  date: string | null;
  amount: number;
  paymentLabel: string;
  balance: number;
};

export type DetailTab =
  | "overview"
  | "ledger"
  | "sales"
  | "payments"
  | "notes"
  | "documents";
