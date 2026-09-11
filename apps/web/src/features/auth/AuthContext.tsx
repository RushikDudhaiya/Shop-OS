import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";

export type AuthShop = {
  _id: string;
  name: string;
  businessType?: string | null;
  role?: string;
};

export type AuthUser = {
  _id: string;
  phone: string;
  name?: string | null;
  isPhoneVerified: boolean;
};

type MeResponse = {
  user: AuthUser;
  shops: AuthShop[];
};

type AuthContextValue = {
  user: AuthUser | null;
  shops: AuthShop[];
  activeShop: AuthShop | null;
  loading: boolean;
  setActiveShopId: (id: string) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  applySession: (data: MeResponse) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ACTIVE_SHOP_KEY = "shop_os_active_shop";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [shops, setShops] = useState<AuthShop[]>([]);
  const [activeShopId, setActiveShopIdState] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_SHOP_KEY),
  );
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((data: MeResponse) => {
    setUser(data.user);
    setShops(data.shops);
    setActiveShopIdState((prev) => {
      const stillValid = data.shops.some((s) => s._id === prev);
      if (stillValid && prev) return prev;
      const next = data.shops[0]?._id ?? null;
      if (next) localStorage.setItem(ACTIVE_SHOP_KEY, next);
      else localStorage.removeItem(ACTIVE_SHOP_KEY);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<MeResponse>("/api/auth/me");
      applySession(data);
    } catch {
      setUser(null);
      setShops([]);
      setActiveShopIdState(null);
      localStorage.removeItem(ACTIVE_SHOP_KEY);
    }
  }, [applySession]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const setActiveShopId = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_SHOP_KEY, id);
    setActiveShopIdState(id);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setShops([]);
      setActiveShopIdState(null);
      localStorage.removeItem(ACTIVE_SHOP_KEY);
    }
  }, []);

  const activeShop = useMemo(
    () => shops.find((s) => s._id === activeShopId) ?? shops[0] ?? null,
    [shops, activeShopId],
  );

  const value = useMemo(
    () => ({
      user,
      shops,
      activeShop,
      loading,
      setActiveShopId,
      refresh,
      logout,
      applySession,
    }),
    [
      user,
      shops,
      activeShop,
      loading,
      setActiveShopId,
      refresh,
      logout,
      applySession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
