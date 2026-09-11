import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadEnv } from "../../lib/env.js";

describe("products", () => {
  let mongo: MongoMemoryServer;
  const env = loadEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://127.0.0.1:27017/unused",
    LOG_LEVEL: "error",
  });
  const app = createApp(env);
  let cookie: string[];
  let shopId: string;

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
      .send({ phone: "9876501234" });
    const verify = await request(app)
      .post("/api/auth/verify")
      .send({ phone: "9876501234", otp: start.body.devOtp });
    cookie = verify.headers["set-cookie"] as string[];

    const shop = await request(app)
      .post("/api/shops")
      .set("Cookie", cookie)
      .send({ name: "Test Kirana", businessType: "kirana" });
    shopId = shop.body.shop._id;
  });

  it("creates product with opening stock ledger", async () => {
    const res = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Parle-G",
        sellingPrice: 10,
        trackStock: true,
        openingStock: 50,
      });

    expect(res.status).toBe(201);
    expect(res.body.product.name).toBe("Parle-G");
    expect(res.body.product.availableStock).toBe(50);
  });

  it("searches products and suggests duplicates", async () => {
    await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Maggi Noodles", sellingPrice: 14, trackStock: false });

    const list = await request(app)
      .get(`/api/shops/${shopId}/products`)
      .query({ q: "maggi" })
      .set("Cookie", cookie);

    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const dup = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Maggi Noodles", sellingPrice: 14, trackStock: false });

    expect(dup.status).toBe(409);
  });

  it("supports quick item without stock tracking", async () => {
    const res = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "₹1 Toffee",
        sellingPrice: 1,
        trackStock: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.product.trackStock).toBe(false);
    expect(res.body.product.availableStock).toBeNull();
  });

  it("denies cross-shop product access", async () => {
    const startB = await request(app)
      .post("/api/auth/start")
      .send({ phone: "9123456789" });
    const verifyB = await request(app)
      .post("/api/auth/verify")
      .send({ phone: "9123456789", otp: startB.body.devOtp });
    const cookieB = verifyB.headers["set-cookie"] as string[];

    const denied = await request(app)
      .get(`/api/shops/${shopId}/products`)
      .set("Cookie", cookieB);

    expect(denied.status).toBe(403);
  });

  it("toggles favorite", async () => {
    const created = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Milk", sellingPrice: 30, trackStock: false, isFavorite: true });

    const favs = await request(app)
      .get(`/api/shops/${shopId}/products`)
      .query({ favorites: "1" })
      .set("Cookie", cookie);

    expect(favs.body.items).toHaveLength(1);
    expect(favs.body.items[0]._id).toBe(created.body.product._id);
  });
});
