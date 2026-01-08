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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Cause Description POC running at http://localhost:${port}`);
});
