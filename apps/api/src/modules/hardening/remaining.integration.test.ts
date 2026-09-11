import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadEnv } from "../../lib/env.js";
import { DEFAULT_ROLE_PERMISSIONS } from "@shop-os/shared";
import { MembershipModel } from "../memberships/membership.model.js";
import { UserModel } from "../auth/user.model.js";

describe("phases 9-14 remaining", () => {
  let mongo: MongoMemoryServer;
  const env = loadEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://127.0.0.1:27017/unused",
    LOG_LEVEL: "error",
  });
  const app = createApp(env);
  let ownerCookie: string[];
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
      .send({ phone: "9555666777" });
    const verify = await request(app)
      .post("/api/auth/verify")
      .send({ phone: "9555666777", otp: start.body.devOtp });
    ownerCookie = verify.headers["set-cookie"] as string[];

    const shop = await request(app)
      .post("/api/shops")
      .set("Cookie", ownerCookie)
      .send({ name: "Final Shop" });
    shopId = shop.body.shop._id;

    const product = await request(app)
      .post(`/api/shops/${shopId}/products`)
      .set("Cookie", ownerCookie)
      .send({
        name: "Notebook",
        sellingPrice: 50,
        purchasePrice: 30,
        trackStock: true,
        openingStock: 20,
      });
    productId = product.body.product._id;
  });

  it("hides purchasePrice from cashier (cost.view)", async () => {
    const cashierUser = await UserModel.create({
      phone: "9666777888",
      isPhoneVerified: true,
    });
    await MembershipModel.create({
      shopId,
      userId: cashierUser._id,
      role: "CASHIER",
      permissions: [...DEFAULT_ROLE_PERMISSIONS.CASHIER],
      status: "ACTIVE",
    });

    const start = await request(app)
      .post("/api/auth/start")
      .send({ phone: "9666777888" });
    const verify = await request(app)
      .post("/api/auth/verify")
      .send({ phone: "9666777888", otp: start.body.devOtp });
    const cashierCookie = verify.headers["set-cookie"] as string[];

    const list = await request(app)
      .get(`/api/shops/${shopId}/products`)
      .set("Cookie", cashierCookie);

    expect(list.status).toBe(200);
    expect(list.body.items[0].purchasePrice).toBeUndefined();

    const ownerList = await request(app)
      .get(`/api/shops/${shopId}/products`)
      .set("Cookie", ownerCookie);
    expect(ownerList.body.items[0].purchasePrice).toBe(30);
  });

  it("imports CSV products after preview", async () => {
    const csv = "name,sellingPrice,purchasePrice,openingStock\nScale,20,12,5";
    const preview = await request(app)
      .post(`/api/shops/${shopId}/products/import/preview`)
      .set("Cookie", ownerCookie)
      .send({ csv });
    expect(preview.status).toBe(200);
    expect(preview.body.rows[0].ok).toBe(true);

    const imp = await request(app)
      .post(`/api/shops/${shopId}/products/import`)
      .set("Cookie", ownerCookie)
      .send({ csv });
    expect(imp.status).toBe(201);
    expect(imp.body.createdCount).toBe(1);
  });

  it("records supplier purchase and increases stock", async () => {
    const supplier = await request(app)
      .post(`/api/shops/${shopId}/suppliers`)
      .set("Cookie", ownerCookie)
      .send({ name: "Local Mart" });

    const purchase = await request(app)
      .post(`/api/shops/${shopId}/purchases`)
      .set("Cookie", ownerCookie)
      .send({
        supplierId: supplier.body.supplier._id,
        items: [{ productId, quantity: 5, unitCost: 28 }],
      });

    expect(purchase.status).toBe(201);

    const prod = await request(app)
      .get(`/api/shops/${shopId}/products/${productId}`)
      .set("Cookie", ownerCookie);
    expect(prod.body.product.availableStock).toBe(25);
  });

  it("AI invoice extract requires review and does not mutate", async () => {
    const res = await request(app)
      .post(`/api/shops/${shopId}/products/ai/invoice-extract`)
      .set("Cookie", ownerCookie)
      .send({ text: "Soap x 10 25\nOil x 2 100" });

    expect(res.body.status).toBe("REVIEW_REQUIRED");
    expect(res.body.applied).toBe(false);

    const prod = await request(app)
      .get(`/api/shops/${shopId}/products/${productId}`)
      .set("Cookie", ownerCookie);
    expect(prod.body.product.availableStock).toBe(20);
  });
});
