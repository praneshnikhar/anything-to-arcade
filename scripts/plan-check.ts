/**
 * Live planner check against a local image. Uses the Gemini free tier.
 * Usage: npx tsx scripts/plan-check.ts [imagePath]
 */
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may be exported already.
}

import { createGeminiAdapter } from "../src/lib/planner/adapter";
import { planFromImage } from "../src/lib/planner/plan";
import { getEnv } from "../src/lib/env";

async function main() {
  const env = getEnv();
  const imagePath = process.argv[2] ?? "samples/hillclimb.webp";
  const adapter = createGeminiAdapter(env.geminiApiKey, env.geminiModel);

  console.log(`Planning ${path.resolve(imagePath)} with ${env.geminiModel}…`);
  const plan = await planFromImage({ imagePath, adapter });
  console.log(JSON.stringify(plan, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
