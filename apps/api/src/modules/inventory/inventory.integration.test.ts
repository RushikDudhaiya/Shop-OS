import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadEnv } from "../../lib/env.js";

describe("inventory + customers", () => {
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
      .send({ phone: "9000011122" });
    const verify = await request(app)
      .post("/api/auth/verify")
      .send({ phone: "9000011122", otp: start.body.devOtp });
    cookie = verify.headers["set-cookie"] as string[];

    const shop = await request(app)
      .post("/api/shops")
      .set("Cookie", cookie)
      .send({ name: "Stock Shop" });
    shopId = shop.body.shop._id;

    const product = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Oil 1L",
        sellingPrice: 150,
        trackStock: true,
        openingStock: 10,
        minStock: 5,
      });
    productId = product.body.product._id;
  });

  it("adjusts stock via ledger and flags low stock", async () => {
    const adj = await request(app)
      .post(`/api/shops/${shopId}/inventory/adjust`)
      .set("Cookie", cookie)
      .send({
        productId,
        type: "MANUAL_ADJUSTMENT_OUT",
        quantityDelta: 6,
        note: "Damage check",
      });

    expect(adj.status).toBe(201);
    expect(adj.body.availableStock).toBe(4);

    const low = await request(app)
      .get(`/api/shops/${shopId}/inventory/low-stock`)
      .set("Cookie", cookie);

    expect(low.body.lowStockCount).toBe(1);
    expect(low.body.items[0].productId).toBe(productId);
  });

  it("rejects negative stock when not allowed", async () => {
    const adj = await request(app)
      .post(`/api/shops/${shopId}/inventory/adjust`)
      .set("Cookie", cookie)
      .send({
        productId,
        type: "DAMAGE_OUT",
        quantityDelta: 50,
      });
    expect(adj.status).toBe(400);
  });

  it("collects udhaar without creating new sale", async () => {
    const sale = await request(app)
      .post(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie)
      .send({
        items: [{ productId, quantity: 1 }],
        complete: true,
        customer: { name: "Sita", phone: "9111222333" },
        payment: { method: "CREDIT" },
        idempotencyKey: "udhaar-sale-test001",
      });

    const customerId = sale.body.sale.customerId as string;
    expect(sale.body.sale.amountDue).toBe(150);

    const collect = await request(app)
      .post(`/api/shops/${shopId}/customers/${customerId}/payments`)
      .set("Cookie", cookie)
      .send({
        method: "CASH",
        amount: 150,
        receivedAmount: 150,
        idempotencyKey: "udhaar-collect-001x",
      });

    expect(collect.status).toBe(201);
    expect(collect.body.allocated).toHaveLength(1);

    const credit = await request(app)
      .get(`/api/shops/${shopId}/credit`)
      .set("Cookie", cookie);
    expect(credit.body.totalOutstanding).toBe(0);

    const sales = await request(app)
      .get(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie);
    expect(sales.body.total).toBe(1);
  });

  it("returns dashboard summary", async () => {
    await request(app)
      .post(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie)
      .send({
        items: [{ productId, quantity: 1 }],
        complete: true,
        payment: { method: "CASH", amount: 150, receivedAmount: 150 },
        idempotencyKey: "summary-sale-001xxxx",
      });

    const summary = await request(app)
      .get(`/api/shops/${shopId}/reports/summary`)
      .set("Cookie", cookie);

    expect(summary.status).toBe(200);
    expect(summary.body.todaySalesTotal).toBe(150);
    expect(summary.body.todaySalesCount).toBe(1);
  });
});
