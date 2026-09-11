import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadEnv } from "../../lib/env.js";
import { SaleModel } from "../sales/sale.model.js";

describe("invoice + share", () => {
  let mongo: MongoMemoryServer;
  const env = loadEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://127.0.0.1:27017/unused",
    LOG_LEVEL: "error",
  });
  const app = createApp(env);
  let cookie: string[];
  let shopId: string;
  let productId: string;
  let saleId: string;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));

    const start = await request(app)
      .post("/api/auth/start")
      .send({ phone: "9444555666" });
    const verify = await request(app)
      .post("/api/auth/verify")
      .send({ phone: "9444555666", otp: start.body.devOtp });
    cookie = verify.headers["set-cookie"] as string[];

    const shop = await request(app)
      .post("/api/shops")
      .set("Cookie", cookie)
      .send({ name: "Invoice Shop" });
    shopId = shop.body.shop._id;

    await request(app)
      .patch(`/api/shops/${shopId}/settings`)
      .set("Cookie", cookie)
      .send({ gstEnabled: true, gstin: "22AAAAA0000A1Z5", phone: "9800000000" });

    const product = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Pen", sellingPrice: 10, trackStock: false });
    productId = product.body.product._id;

    const sale = await request(app)
      .post(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie)
      .send({
        items: [{ productId, quantity: 3 }],
        complete: true,
        customer: { name: "Asha", phone: "9876509876" },
        payment: { method: "CASH", amount: 30, receivedAmount: 50 },
        idempotencyKey: "invoice-sale-001xxxx",
      });
    saleId = sale.body.sale._id;
  });

  it("returns invoice payload with GST fields", async () => {
    const res = await request(app)
      .get(`/api/shops/${shopId}/sales/${saleId}/invoice`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.invoice.invoiceNumber).toBeTruthy();
    expect(res.body.invoice.shop.gstin).toBe("22AAAAA0000A1Z5");
    expect(res.body.invoice.total).toBe(30);
    expect(res.body.invoice.items).toHaveLength(1);
  });

  it("WhatsApp failure does not rollback sale", async () => {
    const res = await request(app)
      .post(`/api/shops/${shopId}/sales/${saleId}/share`)
      .set("Cookie", cookie)
      .send({ channel: "WHATSAPP", simulateFailure: true });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("INVOICE_SHARE_FAILED");
    expect(res.body.saleStatus).toBe("COMPLETED");

    const sale = await SaleModel.findById(saleId);
    expect(sale?.status).toBe("COMPLETED");
    expect(await SaleModel.countDocuments()).toBe(1);
  });

  it("Don't Send skips without deleting sale", async () => {
    const res = await request(app)
      .post(`/api/shops/${shopId}/sales/${saleId}/share`)
      .set("Cookie", cookie)
      .send({ channel: "SKIP" });

    expect(res.body.job.status).toBe("SKIPPED");
    expect((await SaleModel.findById(saleId))?.status).toBe("COMPLETED");
  });
});
