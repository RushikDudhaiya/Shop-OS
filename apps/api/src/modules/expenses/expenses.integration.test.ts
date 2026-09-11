import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadEnv } from "../../lib/env.js";

describe("expenses + reports", () => {
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
      .send({ phone: "9333444555" });
    const verify = await request(app)
      .post("/api/auth/verify")
      .send({ phone: "9333444555", otp: start.body.devOtp });
    cookie = verify.headers["set-cookie"] as string[];

    const shop = await request(app)
      .post("/api/shops")
      .set("Cookie", cookie)
      .send({ name: "Report Shop" });
    shopId = shop.body.shop._id;

    const product = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Soap",
        sellingPrice: 40,
        purchasePrice: 25,
        trackStock: false,
      });
    productId = product.body.product._id;
  });

  it("records expense and includes in summary", async () => {
    const created = await request(app)
      .post(`/api/shops/${shopId}/expenses`)
      .set("Cookie", cookie)
      .send({ category: "Tea/Food", amount: 50, paymentMethod: "CASH" });

    expect(created.status).toBe(201);

    const summary = await request(app)
      .get(`/api/shops/${shopId}/reports/summary`)
      .set("Cookie", cookie);

    expect(summary.body.expensesTotal).toBe(50);
  });

  it("sales report shows totals, payments, top products, estimated profit", async () => {
    await request(app)
      .post(`/api/shops/${shopId}/sales`)
      .set("Cookie", cookie)
      .send({
        items: [{ productId, quantity: 2 }],
        complete: true,
        payment: { method: "UPI", amount: 80 },
        idempotencyKey: "report-sale-001xxxxx",
      });

    await request(app)
      .post(`/api/shops/${shopId}/expenses`)
      .set("Cookie", cookie)
      .send({ category: "Electricity", amount: 20, paymentMethod: "UPI" });

    const report = await request(app)
      .get(`/api/shops/${shopId}/reports/sales`)
      .query({ range: "today" })
      .set("Cookie", cookie);

    expect(report.status).toBe(200);
    expect(report.body.salesTotal).toBe(80);
    expect(report.body.salesCount).toBe(1);
    expect(report.body.paymentsByMethod.UPI).toBe(80);
    expect(report.body.topProducts[0].name).toBe("Soap");
    expect(report.body.expensesTotal).toBe(20);
    // revenue 80 - cost 50 = 30
    expect(report.body.estimatedProfit).toBe(30);
    expect(report.body.profitCoveragePct).toBe(100);
  });
});
