import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";

export type StockUpdatedEvent = {
  shopId: string;
  updates: Array<{ productId: string; currentStock: number }>;
};

const STOCK_EVENT = "shop-os:stock-updated";

export function dispatchStockUpdated(payload: StockUpdatedEvent) {
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
    const origin =
      (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(
        /\/$/,
        "",
      ) ||
      (import.meta.env.PROD ? "https://shop-os-c2qg.onrender.com" : undefined);

    const socket = io(origin, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("shop:join", shopId);
    });

    socket.on("stock:updated", (payload: StockUpdatedEvent) => {
      if (!payload || payload.shopId !== shopId) return;
      dispatchStockUpdated(payload);
      void queryClient.invalidateQueries({ queryKey: ["inventory", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["products", shopId] });
    });

    return () => {
      socket.emit("shop:leave", shopId);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [user, activeShop?._id, queryClient]);

  return null;
}
