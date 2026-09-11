import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PageLoader } from "@/components/ui";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { user, shops, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!shops.length && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}

export function GuestOnly() {
  const { user, shops, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) {
    return <Navigate to={shops.length ? "/" : "/onboarding"} replace />;
  }
  return <Outlet />;
}
