import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadEnv } from "../../lib/env.js";
import { SaleModel } from "./sale.model.js";

describe("sales + payments", () => {
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
      .send({ phone: "9988776655" });
    const verify = await request(app)
      .post("/api/auth/verify")
      .send({ phone: "9988776655", otp: start.body.devOtp });
    cookie = verify.headers["set-cookie"] as string[];

    const shop = await request(app)
      .post("/api/shops")
      .set("Cookie", cookie)
      .send({ name: "Billing Shop" });
    shopId = shop.body.shop._id;

    const product = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Bread",
        sellingPrice: 30,
        trackStock: true,
        openingStock: 100,
      });
    productId = product.body.product._id;
  });

  it("completes cash sale with change and reduces stock", async () => {
    const res = await request(app)
      .post(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie)
      .send({
        items: [{ productId, quantity: 2 }],
        complete: true,
        payment: { method: "CASH", amount: 60, receivedAmount: 100 },
        idempotencyKey: "cash-sale-001xxxxx",
      });

    expect(res.status).toBe(201);
    expect(res.body.sale.total).toBe(60);
    expect(res.body.sale.amountPaid).toBe(60);
    expect(res.body.sale.amountDue).toBe(0);
    expect(res.body.change).toBe(40);
    expect(res.body.payments).toHaveLength(1);

    const stock = await request(app)
      .get(`/api/shops/${shopId}/products/${productId}`)
      .set("Cookie", cookie);
    expect(stock.body.product.availableStock).toBe(98);

    const retry = await request(app)
      .post(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie)
      .send({
        items: [{ productId, quantity: 2 }],
        complete: true,
        payment: { method: "CASH", amount: 60, receivedAmount: 100 },
        idempotencyKey: "cash-sale-001xxxxx",
      });
    expect(retry.body.sale._id).toBe(res.body.sale._id);
    expect(await SaleModel.countDocuments()).toBe(1);
  });

  it("credit sale keeps due; later payment is not new revenue", async () => {
    const sale = await request(app)
      .post(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie)
      .send({
        items: [{ productId, quantity: 1 }],
        complete: true,
        customer: { name: "Ramesh", phone: "9876543210" },
        payment: { method: "CREDIT" },
        idempotencyKey: "credit-sale-001xxx",
      });

    expect(sale.status).toBe(201);
    expect(sale.body.sale.total).toBe(30);
    expect(sale.body.sale.amountDue).toBe(30);
    expect(sale.body.payments).toHaveLength(0);

    const pay = await request(app)
      .post(`/api/shops/${shopId}/sales/${sale.body.sale._id}/payments`)
      .set("Cookie", cookie)
      .send({
        method: "CASH",
        amount: 30,
        receivedAmount: 30,
        idempotencyKey: "collect-udhaar-001x",
      });

    expect(pay.status).toBe(201);
    expect(pay.body.sale.amountDue).toBe(0);
    expect(pay.body.sale.amountPaid).toBe(30);
    expect(await SaleModel.countDocuments()).toBe(1);
  });

  it("partial payment leaves amountDue", async () => {
    const sale = await request(app)
      .post(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie)
      .send({
        items: [{ productId, quantity: 4 }],
        complete: true,
        payment: { method: "UPI", amount: 50 },
        idempotencyKey: "partial-sale-001xxx",
      });

    expect(sale.body.sale.total).toBe(120);
    expect(sale.body.sale.amountPaid).toBe(50);
    expect(sale.body.sale.amountDue).toBe(70);
  });
});
