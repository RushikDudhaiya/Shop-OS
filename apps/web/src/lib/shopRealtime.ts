import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";

export type StockUpdatedEvent = {
  shopId: string;
  updates: Array<{ productId: string; currentStock: number }>;
};

const STOCK_EVENT = "shop-os:stock-updated";

export function dispatchStockUpdated(payload: StockUpdatedEvent) {
  if (!payload?.shopId || !payload.updates?.length) return;
  window.dispatchEvent(new CustomEvent(STOCK_EVENT, { detail: payload }));
}

export function onStockUpdated(
  handler: (payload: StockUpdatedEvent) => void,
): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<StockUpdatedEvent>).detail);
  };
  window.addEventListener(STOCK_EVENT, listener);
  return () => window.removeEventListener(STOCK_EVENT, listener);
}

function socketOrigin(): string | undefined {
  const fromEnv = (
    import.meta.env.VITE_API_ORIGIN as string | undefined
  )?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Production web (Vercel) talks to Render API directly for websockets.
  if (import.meta.env.PROD) return "https://shop-os-c2qg.onrender.com";
  return undefined; // Vite proxy /socket.io → localhost:4000
}

async function fetchRealtimeTicket(): Promise<string> {
  const { ticket } = await api<{ ticket: string }>("/api/auth/realtime-ticket", {
    method: "POST",
  });
  return ticket;
}

/**
 * Keeps a Socket.IO connection for the active shop and broadcasts stock:updated
 * to React Query + window listeners (Bill/Products/Inventory local state).
 */
export function ShopRealtimeBridge() {
  const { activeShop, user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user || !activeShop?._id) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const shopId = activeShop._id;
    let cancelled = false;
    let socket: Socket | null = null;
    let refreshTimer: number | undefined;

    async function connect() {
      try {
        const ticket = await fetchRealtimeTicket();
        if (cancelled) return;

        socket = io(socketOrigin(), {
          path: "/socket.io",
          withCredentials: true,
          auth: { ticket },
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionDelay: 1500,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          socket?.emit("shop:join", shopId);
        });

        socket.io.on("reconnect_attempt", () => {
          void fetchRealtimeTicket()
            .then((next) => {
              if (socket) socket.auth = { ticket: next };
            })
            .catch(() => {
              /* ignore — next attempt retries */
            });
        });

        socket.on("stock:updated", (payload: StockUpdatedEvent) => {
          if (!payload || payload.shopId !== shopId) return;
          dispatchStockUpdated(payload);
          void queryClient.invalidateQueries({
            queryKey: ["inventory", shopId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["products", shopId],
          });
        });

        // Refresh ticket before ~10 min expiry so reconnects stay authed.
        refreshTimer = window.setInterval(() => {
          void fetchRealtimeTicket()
            .then((next) => {
              if (socket) socket.auth = { ticket: next };
            })
            .catch(() => {
              /* ignore */
            });
        }, 8 * 60 * 1000);
      } catch {
        /* API down — own-bill stockUpdates still update local UI */
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (refreshTimer) window.clearInterval(refreshTimer);
      socket?.emit("shop:leave", shopId);
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [user, activeShop?._id, queryClient]);

  return null;
}
