import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/features/auth/AuthContext";
import { GuestOnly, RequireAuth } from "@/features/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { OnboardingPage } from "@/features/auth/OnboardingPage";
import { HomePage } from "@/features/home/HomePage";
import { BillPage } from "@/features/billing/BillPage";
import { ProductsPage } from "@/features/products/ProductsPage";
import { CustomersPage } from "@/features/customers/CustomersPage";
import { InventoryPage } from "@/features/inventory/InventoryPage";
import { InvoicePage } from "@/features/billing/InvoicePage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { ProfitMarginPage } from "@/features/profit/ProfitMarginPage";
import { ExpensesPage } from "@/features/expenses/ExpensesPage";
import { MorePage } from "@/features/settings/MorePage";
import { StaffPage } from "@/features/settings/StaffPage";
import { PurchasesPage } from "@/features/purchases/PurchasesPage";
import { AutopilotPage } from "@/features/autopilot/AutopilotPage";
import { ShopRealtimeBridge } from "@/lib/shopRealtime";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ShopRealtimeBridge />
        <BrowserRouter>
          <Routes>
            <Route element={<GuestOnly />}>
              <Route path="login" element={<LoginPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="bill" element={<BillPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="profit" element={<ProfitMarginPage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="autopilot" element={<AutopilotPage />} />
                <Route path="purchases" element={<PurchasesPage />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="more" element={<MorePage />} />
                <Route path="invoice/:saleId" element={<InvoicePage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
