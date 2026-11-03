/**
 * Live smoke test for the Tripo API. Spends real (free-tier) credits.
 * Usage: SAMPLE_IMAGE=./samples/hillclimb.webp npm run tripo:smoke
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local is optional when the variables are already exported.
}

import { getEnv } from "../src/lib/env";
import { createTripoClient } from "../src/lib/tripo/client";

const POLL_MS = 5000;
const TIMEOUT_MS = 10 * 60 * 1000;

async function main() {
  const env = getEnv();
  const imagePath = process.env.SAMPLE_IMAGE ?? "samples/hillclimb.webp";
  const bytes = await readFile(imagePath);
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const fileType = ext === "png" ? "png" : ext === "webp" ? "webp" : "jpg";

  const client = createTripoClient({ apiKey: env.tripoApiKey });

  console.log(`Uploading ${imagePath} (${(bytes.length / 1024).toFixed(0)} KB)…`);
  const { fileToken } = await client.uploadImage(bytes, `sample.${fileType}`);
  console.log(`Uploaded. file token: ${fileToken}`);

  const { taskId } = await client.createImageToModelTask({
    fileToken,
    faceLimit: 10000,
    modelVersion: env.tripoModelVersion,
    fileType,
  });
  console.log(`Task created: ${taskId} (model ${env.tripoModelVersion})`);

  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const task = await client.getTask(taskId);
    console.log(
      `status=${task.status} progress=${task.progress}${task.error ? ` error=${task.error}` : ""}`,
    );

    if (task.status === "success") {
      console.log(`model url: ${task.modelUrl ?? "(missing)"}`);
      return;
    }
    if (["failed", "banned", "expired", "cancelled"].includes(task.status)) {
      process.exitCode = 1;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  console.error("Timed out waiting for the task.");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
