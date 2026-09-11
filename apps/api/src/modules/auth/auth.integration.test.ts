import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadEnv } from "../../lib/env.js";

describe("auth + shop membership", () => {
  let mongo: MongoMemoryServer;
  const env = loadEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://127.0.0.1:27017/unused",
    LOG_LEVEL: "error",
  });
  const app = createApp(env);

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
  });

  async function login(phone: string) {
    const start = await request(app).post("/api/auth/start").send({ phone });
    expect(start.status).toBe(200);
    const otp = start.body.devOtp as string;
    const challengeId = start.body.challengeId as string;
    const verify = await request(app)
      .post("/api/auth/verify")
      .send({ phone, otp, challengeId });
    expect(verify.status).toBe(200);
    const cookie = verify.headers["set-cookie"];
    expect(cookie).toBeTruthy();
    return { cookie: cookie as string[], body: verify.body };
  }

  it("logs in with OTP and creates session cookie", async () => {
    const { body } = await login("9876543210");
    expect(body.user.phone).toBe("9876543210");
    expect(body.shops).toEqual([]);
  });

  it("creates shop and assigns OWNER membership", async () => {
    const { cookie } = await login("9876543210");
    const create = await request(app)
      .post("/api/shops")
      .set("Cookie", cookie)
      .send({ name: "Ravi Kirana", businessType: "kirana" });
    expect(create.status).toBe(201);
    expect(create.body.role).toBe("OWNER");
    expect(create.body.shop.name).toBe("Ravi Kirana");

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.body.shops).toHaveLength(1);
  });

  it("denies cross-shop access", async () => {
    const ownerA = await login("9111111111");
    const ownerB = await login("9222222222");

    const shopA = await request(app)
      .post("/api/shops")
      .set("Cookie", ownerA.cookie)
      .send({ name: "Shop A" });
    const shopB = await request(app)
      .post("/api/shops")
      .set("Cookie", ownerB.cookie)
      .send({ name: "Shop B" });

    const denied = await request(app)
      .get(`/api/shops/${shopB.body.shop._id}`)
      .set("Cookie", ownerA.cookie);

    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("FORBIDDEN");

    const allowed = await request(app)
      .get(`/api/shops/${shopA.body.shop._id}`)
      .set("Cookie", ownerA.cookie);
    expect(allowed.status).toBe(200);
  });

  it("rejects unauthenticated shop create", async () => {
    const res = await request(app).post("/api/shops").send({ name: "No Auth" });
    expect(res.status).toBe(401);
  });
});
