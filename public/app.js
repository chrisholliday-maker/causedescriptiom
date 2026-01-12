const urlInput = document.getElementById("url");
const generateBtn = document.getElementById("generate");
const regenBtn = document.getElementById("regenerate");
const copyBtn = document.getElementById("copy");

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const shortEl = document.getElementById("short");
const longEl = document.getElementById("long");
const tagsEl = document.getElementById("tags");

const confidenceEl = document.getElementById("confidence");
const locationEl = document.getElementById("location");

const evidenceEl = document.getElementById("evidence");
const sourcesEl = document.getElementById("sources");



function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  regenBtn.disabled = isLoading;
  copyBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? "Working…" : "Generate";
}

function showStatus(msg) {
  statusEl.textContent = msg;
}

function renderResult(data) {
  resultsEl.classList.remove("hidden");

  confidenceEl.textContent = `Confidence: ${data.confidence || "unknown"}`;
  locationEl.textContent = data.location ? `Location: ${data.location}` : "Location: not specified";

  shortEl.value = data.short_description || "";
  longEl.value = data.long_description || "";
  tagsEl.value = Array.isArray(data.tags) ? data.tags.join(", ") : "";

  evidenceEl.innerHTML = "";
  if (Array.isArray(data.evidence)) {
    for (const ev of data.evidence) {
      const li = document.createElement("li");
      li.innerHTML = `${ev.claim} <br/><a href="${ev.source_url}" target="_blank">${ev.source_url}</a>`;
      evidenceEl.appendChild(li);
    }
  }

  sourcesEl.innerHTML = "";
  if (Array.isArray(data.sources_used)) {
    for (const s of data.sources_used) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="${s}" target="_blank">${s}</a>`;
      sourcesEl.appendChild(li);
    }
  }
}

async function run() {
  const url = urlInput.value.trim();
  if (!url) {
    showStatus("Please enter a website URL.");
    return;
  }

  setLoading(true);
  showStatus("Fetching pages and generating description…");
  resultsEl.classList.add("hidden");
 
  

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (!res.ok) {
      const details = data.details ? ` — ${data.details}` : "";
      showStatus(`Error: ${data.error || "Request failed"}${details}`);
      return;
    }

    if (data.confidence === "low" && data.reason) {
      showStatus(`Low confidence: ${data.reason}`);
    } else {
      showStatus("Done — review and edit the text below.");
    }

    renderResult(data);
  } catch (e) {
    showStatus("Error: Could not reach server.");
  } finally {
    setLoading(false);
  }
}

generateBtn.addEventListener("click", run);
regenBtn.addEventListener("click", run);

copyBtn.addEventListener("click", async () => {
  const payload = {
    url: urlInput.value.trim(),
    short_description: shortEl.value,
    long_description: longEl.value,
    tags: tagsEl.value
  };

  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  showStatus("Copied to clipboard ✅");
});
