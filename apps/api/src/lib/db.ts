import dns from "node:dns";
import mongoose from "mongoose";
import { logger } from "./logger.js";

/**
 * Some home-router DNS resolvers refuse Node's SRV lookups for mongodb+srv
 * (querySrv ECONNREFUSED) while nslookup still works. Prefer public resolvers
 * for SRV so Atlas connection strings keep working on Windows.
 */
function preferPublicDnsForSrv(uri: string) {
  if (!uri.startsWith("mongodb+srv://")) return;
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  } catch {
    // ignore — fall through to system DNS
  }
}

export async function connectMongo(uri: string) {
  mongoose.set("strictQuery", true);
  preferPublicDnsForSrv(uri);
  await mongoose.connect(uri);
  logger.info("MongoDB connected");
}

export async function disconnectMongo() {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
}
