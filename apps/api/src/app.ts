import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { Env } from "./lib/env.js";
import { attachEnv } from "./middleware/attach-env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { autopilotRouter } from "./modules/autopilot/autopilot.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { creditRouter, customersRouter } from "./modules/customers/customers.routes.js";
import { expensesRouter } from "./modules/expenses/expenses.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import {
  categoriesRouter,
  productsRouter,
} from "./modules/products/products.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import {
  saleDetailRouter,
  salesRouter,
} from "./modules/sales/sales.routes.js";
import { invoiceRouter } from "./modules/invoices/invoice.routes.js";
import {
  purchasesRouter,
  suppliersRouter,
} from "./modules/purchases/purchases.routes.js";
import { shopsRouter } from "./modules/shops/shops.routes.js";

export function createApp(env: Env) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(attachEnv(env));
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  }

  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", shopsRouter);
  app.use("/api", saleDetailRouter);
  app.use("/api/shops/:shopId/products", productsRouter);
  app.use("/api/shops/:shopId/categories", categoriesRouter);
  app.use("/api/shops/:shopId/sales", salesRouter);
  app.use("/api/shops/:shopId/sales", invoiceRouter);
  app.use("/api/shops/:shopId/inventory", inventoryRouter);
  app.use("/api/shops/:shopId/customers", customersRouter);
  app.use("/api/shops/:shopId/credit", creditRouter);
  app.use("/api/shops/:shopId/reports", reportsRouter);
  app.use("/api/shops/:shopId/autopilot", autopilotRouter);
  app.use("/api/shops/:shopId/expenses", expensesRouter);
  app.use("/api/shops/:shopId/suppliers", suppliersRouter);
  app.use("/api/shops/:shopId/purchases", purchasesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
