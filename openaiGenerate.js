import OpenAI from "openai";
import { causeDescriptionSchema } from "./schema.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function generateCauseDescriptionFromPages(bundle) {
  try {
    const prompt = `
You are writing descriptions for nonprofit organisations ("causes") on a fundraising platform.

CONTEXT:
- The input may be a normal website OR a social profile/page (e.g. a Facebook page).
- Social pages may contain limited "About" information and short post excerpts. Use what is available.

IMPORTANT RULES:
- Use ONLY the content provided in the "pages" below.
- ONLY use facts, numbers, claims, partners, awards, registration status, or locations that are found in the given pages.
- Give a confidence of high if mission, activities and beneficiaries are clearly described, medium if mession is clear but activities or scope are vague and low if minimal or unclear information across the given pages.
- Write in UK English. Keep tone professional, warm, and factual.
- Avoid marketing fluff (e.g., "world-class", "leading") unless explicitly stated.
- Avoid sensitive assumptions unless explicitly stated.
- The long_description MUST be <= 2000 characters.
- short_description MUST be <= 240 characters.
- Produce 1–6 tags (lowercase, short).
- location should be null unless clearly stated.
- Provide evidence claims that map to source_url. Every key claim in the description should be supported by evidence.

HOW TO HANDLE FACEBOOK / SOCIAL PAGES:
- Prefer any "About", "Intro", "Bio", or mission-style text if present.
- If the content is mostly post snippets, summarise what the organisation does based on repeated themes (e.g., fundraising events, community support), but do not guess specifics.
- Do NOT quote or include personal data from posts (phone numbers, emails, addresses, names of private individuals) unless it clearly represents the organisation (e.g., the official page name).
- If there is insufficient information (e.g., mostly navigation text, cookie banners, “Log in to continue”), set confidence to "low" and produce a cautious, generic description.

EVIDENCE REQUIREMENT:
- Provide evidence claims that map to source_url (from the provided pages only).
- Every key claim in the descriptions should be supported by at least one evidence item.
- If you cannot support a claim with the provided text, omit it.

OUTPUT FORMAT:
Return JSON matching the provided schema exactly.

INPUT:
orgUrl: ${bundle.url}

pages:
${JSON.stringify(bundle.pages, null, 2)}
`.trim();

    const response = await openai.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: "You are a careful assistant that follows instructions and produces strict JSON." },
        { role: "user", content: prompt }
      ],
      text: {
        format: {
          type: "json_schema",
          name: causeDescriptionSchema.name,
          schema: causeDescriptionSchema.schema,
          strict: true
        }
      },
      temperature: 0.3
    });

    const out = response.output_text;
    if (!out) return { ok: false, error: "Empty response" };

    let data;
    try {
      data = JSON.parse(out);
    } catch {
      return { ok: false, error: "Model returned invalid JSON", details: out };
    }

    if (data.short_description?.length > 240) {
      data.short_description = data.short_description.slice(0, 237).trimEnd() + "...";
      if (data.confidence === "high") data.confidence = "medium";
    }

    const wc = wordCount(data.long_description || "");
    if (wc > 500) {
      const words = data.long_description.trim().split(/\s+/).slice(0, 500);
      data.long_description = words.join(" ").trimEnd() + ".";
      if (data.confidence === "high") data.confidence = "medium";
    }

    const allowed = new Set(bundle.pages.map(p => p.url));
    if (Array.isArray(data.evidence)) {
      data.evidence = data.evidence.filter(ev => allowed.has(ev.source_url));
    }

    if (!data.evidence || data.evidence.length < 2) {
      data.confidence = "low";
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: "Generation failed", details: String(err?.message || err) };
  }
}
