import "dotenv/config";
import fs from "fs/promises";
import path from "path";

import { createAssistant, updateAssistant } from "../src/lib/vapi.js";

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function main() {
  const publicUrl = getArg("--public-url") || process.env.PUBLIC_BASE_URL;
  const assistantId = getArg("--assistant-id");

  if (!publicUrl) {
    throw new Error("Missing --public-url (or PUBLIC_BASE_URL in .env)");
  }

  const configPath = path.resolve(process.cwd(), "src/config/vapi-assistant.json");
  const raw = await fs.readFile(configPath, "utf8");

  const replaced = raw.replaceAll("https://YOUR_PUBLIC_URL", publicUrl.replace(/\/$/, ""));
  const payload = JSON.parse(replaced);

  const result = assistantId
    ? await updateAssistant(assistantId, payload)
    : await createAssistant(payload);

  console.log(JSON.stringify({
    mode: assistantId ? "updated" : "created",
    assistantId: result.id,
    phoneNumberId: result.phoneNumberId || null,
    name: result.name
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
