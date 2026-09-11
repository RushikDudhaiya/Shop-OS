import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  res.status(mongoReady ? 200 : 503).json({
    ok: mongoReady,
    service: "shop-os-api",
    mongo: mongoReady ? "up" : "down",
    time: new Date().toISOString(),
  });
});
