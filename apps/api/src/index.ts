import "dotenv/config";
import { createApp } from "./app.js";
import { connectMongo } from "./lib/db.js";
import { loadEnv } from "./lib/env.js";
import { logger, setLogLevel } from "./lib/logger.js";

async function main() {
  const env = loadEnv();
  setLogLevel(env.LOG_LEVEL);

  try {
    await connectMongo(env.MONGODB_URI);
  } catch (err) {
    logger.warn("MongoDB not ready yet — health will report down", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const app = createApp(env);
  app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  logger.error("Failed to start API", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
