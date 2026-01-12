import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { buildContentBundleFromUrl } from "./crawler.js";
import { generateCauseDescriptionFromPages } from "./openaiGenerate.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/generate", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid url" });
  }

  try {
    const bundle = await buildContentBundleFromUrl(url);

    if (!bundle.pages.length) {
      return res.status(200).json({
        confidence: "low",
        reason: "Unable to extract meaningful content from the website.",
        fallback_suggestions: [
          "Try adding a link to your About page.",
          "Paste a short paragraph about your work."
        ]
      });
    }

    const result = await generateCauseDescriptionFromPages(bundle);

    if (!result.ok) {
      return res.status(500).json({ error: result.error, details: result.details });
    }

    res.json({
  ...result.data,
  sources_used: bundle.pages.map(p => p.url),
  notes: "Generated from website text. Please review."
});
  } catch (err) {
    res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
});
app.get("/api/logo", async (req, res) => {
  const { url } = req.query || {};
  if (!url || typeof url !== "string") return res.status(400).send("Missing url");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

  try {
    const resp = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (POC Cause Description Generator)" },
      signal: controller.signal
    });

    if (!resp.ok) return res.status(502).send("Failed to fetch image");

    // Basic guard: only allow images
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res.status(415).send("Not an image");
    }

    // Size cap (2MB) to avoid hanging on huge files
    const MAX_BYTES = 2 * 1024 * 1024;
    const reader = resp.body?.getReader();
    if (!reader) return res.status(502).send("No body");

    let received = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        controller.abort();
        return res.status(413).send("Image too large");
      }
      chunks.push(value);
    }

    clearTimeout(timeout);
    res.setHeader("Content-Type", contentType);
    res.send(Buffer.concat(chunks.map(c => Buffer.from(c))));
  } catch (e) {
    clearTimeout(timeout);
    // Abort errors will come here too
    return res.status(504).send("Timed out fetching image");
  }
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Cause Description POC running at http://localhost:${port}`);
});
