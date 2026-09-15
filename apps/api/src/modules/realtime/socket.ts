import type { Server as HttpServer } from "node:http";
import { Types } from "mongoose";
import { Server } from "socket.io";
import type { Env } from "../../lib/env.js";
import { hashValue } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { SESSION_COOKIE } from "../../middleware/require-auth.js";
import { RealtimeTicketModel } from "../auth/realtime-ticket.model.js";
import { SessionModel } from "../auth/session.model.js";
import { UserModel } from "../auth/user.model.js";
import { MembershipModel } from "../memberships/membership.model.js";

export type StockUpdatedPayload = {
  shopId: string;
  updates: Array<{
    productId: string;
    currentStock: number;
  }>;
};

let io: Server | null = null;

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

async function resolveUserId(socket: {
  handshake: { auth?: Record<string, unknown>; headers: { cookie?: string } };
}): Promise<Types.ObjectId | null> {
  const authTicket =
    typeof socket.handshake.auth?.ticket === "string"
      ? socket.handshake.auth.ticket
      : null;
  if (authTicket) {
    // Multi-use until expiry so Socket.IO reconnects keep working.
    const row = await RealtimeTicketModel.findOne({
      tokenHash: hashValue(authTicket),
      expiresAt: { $gt: new Date() },
    });
    if (row) return row.userId as Types.ObjectId;
  }

  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await SessionModel.findOne({
    tokenHash: hashValue(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await UserModel.findById(session.userId);
  return user?._id ?? null;
}

export function initRealtime(httpServer: HttpServer, env: Env) {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: env.CORS_ORIGIN.split(",").map((o: string) => o.trim()),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const userId = await resolveUserId(socket);
      if (!userId) {
        next(new Error("Unauthorized"));
        return;
      }
      socket.data.userId = userId;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on(
      "shop:join",
      async (shopId: unknown, ack?: (ok: boolean) => void) => {
        try {
          if (typeof shopId !== "string" || !Types.ObjectId.isValid(shopId)) {
            ack?.(false);
            return;
          }
          const userId = socket.data.userId as Types.ObjectId;
          const membership = await MembershipModel.findOne({
            shopId,
            userId,
            status: "ACTIVE",
          });
          if (!membership) {
            ack?.(false);
            return;
          }
          await socket.join(`shop:${shopId}`);
          ack?.(true);
        } catch (err) {
          logger.warn("shop:join failed", {
            message: err instanceof Error ? err.message : String(err),
          });
          ack?.(false);
        }
      },
    );

    socket.on("shop:leave", async (shopId: unknown) => {
      if (typeof shopId === "string") {
        await socket.leave(`shop:${shopId}`);
      }
    });
  });

  logger.info("Socket.IO realtime ready");
  return io;
}

export function emitStockUpdated(
  shopId: Types.ObjectId | string,
  updates: Array<{ productId: Types.ObjectId | string; currentStock: number }>,
) {
  if (!io || !updates.length) return;
  const id = String(shopId);
  const payload: StockUpdatedPayload = {
    shopId: id,
    updates: updates.map((u) => ({
      productId: String(u.productId),
      currentStock: u.currentStock,
    })),
  };
  io.to(`shop:${id}`).emit("stock:updated", payload);
}
