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

// Logo proxy with timeout + size cap (prevents hanging)
app.get("/api/logo", async (req, res) => {
  const { url } = req.query || {};
  if (!url || typeof url !== "string") return res.status(400).send("Missing url");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const resp = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (POC Cause Description Generator)" },
      signal: controller.signal
    });

    if (!resp.ok) return res.status(502).send("Failed to fetch image");

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res.status(415).send("Not an image");
    }

    const MAX_BYTES = 2 * 1024 * 1024; // 2MB
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

    res.setHeader("Content-Type", contentType);
    res.send(Buffer.concat(chunks.map(c => Buffer.from(c))));
  } catch (e) {
    return res.status(504).send("Timed out fetching image");
  } finally {
    clearTimeout(timeout);
  }
});

app.post("/api/generate", async (req, res) => {
  const { url } = req.body || {};
 

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid url" });
  }

  try {
    const bundle = await buildContentBundleFromUrl(url);
 console.log("URL:", url);
console.log("Pages returned:", bundle.pages.length);
console.log(
  "First page preview:",
  bundle.pages?.[0]?.text?.slice(0, 200)
);
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
      logo_url: bundle.logo_url || null,
      sources_used: bundle.pages.map(p => p.url),
      notes: "Generated from website text. Please review."
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Cause Description POC running at http://localhost:${port}`);
});
