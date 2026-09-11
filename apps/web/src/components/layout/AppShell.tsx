import { Outlet, useLocation } from "react-router-dom";
import { SyncBanner } from "@/offline/SyncBanner";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import "@/features/billing/bill-layout.css";

export function AppShell() {
  const { pathname } = useLocation();
  const isBillPage = pathname === "/bill";

  if (isBillPage) {
    return (
      <div className="bill-app-grid">
        <Sidebar />
        <main className="bill-outlet-main">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#eef1f4]">
      <Sidebar />
      <div className="relative flex min-h-dvh min-w-0 flex-1 flex-col bg-[#eef1f4]">
        <SyncBanner />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-3 pb-28 pt-4 md:px-4 md:pb-10 md:pt-5 lg:px-5">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
