import { JSDOM } from "jsdom";
import * as cheerio from "cheerio";

function absoluteUrl(maybeUrl, baseUrl) {
  try {
    if (!maybeUrl) return null;
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function pickBestIcon(icons) {
  // Prefer biggest sizes, then any icon
  const scored = icons
    .map(i => {
      const sizes = (i.sizes || "").toLowerCase();
      const match = sizes.match(/(\d+)x(\d+)/);
      const area = match ? (parseInt(match[1], 10) * parseInt(match[2], 10)) : 0;
      return { ...i, area };
    })
    .sort((a, b) => (b.area - a.area));
  return scored[0] || null;
}



function normalizeUrl(url) {
  try {
    let u = new URL(url);
    if (!u.protocol.startsWith("http")) u = new URL("https://" + url);
    return u.toString();
  } catch {
    return null;
  }
}

function sameDomain(base, candidate) {
  try {
    return new URL(base).hostname === new URL(candidate).hostname;
  } catch {
    return false;
  }
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (POC Cause Description Generator)",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const abs = new URL(href, baseUrl).toString();
      if (!sameDomain(baseUrl, abs)) return;
      if (abs.includes("#")) return;
      if (/(privacy|terms|cookies|policy|careers|jobs|news|blog|press)/i.test(abs)) return;
      links.add(abs);
    } catch {
      // ignore
    }
  });

  return Array.from(links);
}

function scoreLink(url) {
  const u = url.toLowerCase();
  const keywords = [
    "about",
    "who-we-are",
    "mission",
    "vision",
    "what-we-do",
    "our-work",
    "impact",
    "projects",
    "programmes",
    "programs",
    "donate"
  ];

  let score = 0;
  for (const k of keywords) {
    if (u.includes(k)) score += 3;
  }
  score += Math.max(0, 8 - u.length / 30);
  return score;
}

function extractReadableText(html, url) {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  document.querySelectorAll("script, style, noscript").forEach(el => el.remove());
  document.querySelectorAll("nav, footer, header").forEach(el => el.remove());

  const title = document.title || "Untitled";
  const main = document.querySelector("main") || document.body;
  const text = main.textContent || "";

  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

  return {
    title,
    text: cleaned.slice(0, 12000)
  };
}

export async function buildContentBundleFromUrl(inputUrl) {
  const url = normalizeUrl(inputUrl);
  if (!url) {
    return { url: inputUrl, pages: [] };
  }

  const homepageHtml = await fetchHtml(url);
if (!homepageHtml) {
  return { url, pages: [] };
}



  const homepage = extractReadableText(homepageHtml, url);
  const links = extractLinks(homepageHtml, url)
    .sort((a, b) => scoreLink(b) - scoreLink(a))
    .slice(0, 7);

  const pages = [{ url, title: homepage.title, text: homepage.text }];

  for (const link of links) {
    if (pages.length >= 6) break;
    if (pages.some(p => p.url === link)) continue;

    const html = await fetchHtml(link);
    if (!html) continue;

    const { title, text } = extractReadableText(html, link);
    if (!text || text.length < 400) continue;

    pages.push({ url: link, title, text });
  }

  let totalChars = 0;
  const cappedPages = [];
  for (const p of pages) {
    if (totalChars > 50000) break;
    totalChars += p.text.length;
    cappedPages.push(p);
  }

  return { url, pages: cappedPages };
}
