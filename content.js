// --- Minimal config for Wh ---
const DEFAULTS = {
  baselineWhPer500Tokens: 0.30, // Wh per 500 tokens (in+out)
  pue: 1.2,                     // datacenter overhead multiplier
  charsPerToken: 4              // fallback tokenizer heuristic
};

/* ===== Chrome API guards + safe helpers ===== */
function getChromeApi() {
  try { if (typeof chrome !== 'undefined' && chrome?.runtime?.id) return chrome; } catch(_) {}
  return null;
}
async function safeSyncGet(defaults) {
  const c = getChromeApi();
  if (!c?.storage?.sync) return defaults;
  try { const v = await c.storage.sync.get(defaults); return Object.assign({}, defaults, v); }
  catch { return defaults; }
}
async function safeLocalGet(key, fallback) {
  const c = getChromeApi();
  if (!c?.storage?.local) return { [key]: fallback };
  try { return await c.storage.local.get({ [key]: fallback }); }
  catch { return { [key]: fallback }; }
}
async function safeLocalSet(obj) {
  const c = getChromeApi();
  if (!c?.storage?.local) return;
  try { await c.storage.local.set(obj); } catch {}
}

/* ===== Utilities ===== */
const estimateTokens = (text, cpt) => Math.max(1, Math.round((text || "").trim().length / cpt));
const getConvoId = () => {
  const m = (location.pathname || "").match(/\/c\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
};

// Overlay UI
const ensureOverlay = () => {
  let el = document.getElementById("pem-overlay");
  if (el) return el;
  el = document.createElement("div");
  el.id = "pem-overlay";
  el.innerHTML = `<div id="pem-card">
      <div id="pem-title" style="font-variant:small-caps;">Prompt Energy (This Chat Total)</div>
      <div id="pem-body"><span id="pem-wh">0.000</span> Wh</div>
    </div>`;
  document.body.appendChild(el);
  return el;
};

const computeWh = ({ inTokens, outTokens, opts }) => {
  const totalTokens = Math.max(1, inTokens + outTokens);
  const whCore = opts.baselineWhPer500Tokens * (totalTokens / 500);
  return whCore * opts.pue;
};

async function updateOverlayTotal() {
  const overlay = ensureOverlay();
  const { history = [] } = await safeLocalGet('history', []);
  const cid = getConvoId();
  const thisChat = cid ? history.filter(x => x.convoId === cid) : [];
  const totalWh = thisChat.reduce((s, x) => s + (x.wh || 0), 0);
  overlay.querySelector("#pem-wh").textContent = totalWh.toFixed(3);
}

/* ===== Robust logging (once per assistant message) ===== */
let lastPromptAtSend = "";
let lastConvoId = null;
let lastLoggedNode = null;

// capture typed prompt right when user submits (Enter without Shift)
function setupInputHook() {
  const inputEl = document.querySelector("textarea, [contenteditable='true']");
  if (!inputEl) return;
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      lastPromptAtSend = (inputEl.value || inputEl.innerText || "").trim();
    }
  }, { capture: true });
}

// find the latest assistant bubble
function getLatestAssistantNode() {
  const nodes = document.querySelectorAll('[data-message-author-role="assistant"], [data-testid="bot"]');
  return nodes.length ? nodes[nodes.length - 1] : null;
}

async function logAssistantMessageIfNew() {
  const node = getLatestAssistantNode();
  if (!node) return;

  // Only log if this is a new assistant message node (not the same DOM element)
  if (node === lastLoggedNode) return;

  // If it’s the same conversation but node text is empty (still streaming), wait
  const outText = (node.innerText || node.textContent || "").trim();
  if (!outText) return;

  lastLoggedNode = node; // mark as logged

  const opts = await safeSyncGet(DEFAULTS);
  const inTok  = estimateTokens(lastPromptAtSend, opts.charsPerToken);
  const outTok = estimateTokens(outText,        opts.charsPerToken);
  const wh     = computeWh({ inTokens: inTok, outTokens: outTok, opts });

  const { history = [] } = await safeLocalGet('history', []);
  history.push({
    ts: Date.now(),
    tokens: inTok + outTok,
    wh,
    url: location.href,
    convoId: getConvoId()
  });
  await safeLocalSet({ history });

  // Update overlay total for this chat
  await updateOverlayTotal();

  // Reset captured prompt so next send is fresh
  lastPromptAtSend = "";
}

/* ===== Observe DOM changes efficiently ===== */
let observer;

function setupObserver() {
  const root = document.querySelector('[data-testid="conversation-turns"]') || document.body;

  // Mutation observer that reacts to message insertions (not every character)
  observer = new MutationObserver((mutations) => {
    // If any mutation adds an element that looks like an assistant bubble, check/log
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        // Debounce a little to allow final content to settle
        setTimeout(logAssistantMessageIfNew, 250);
        break;
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
}

/* ===== Handle SPA navigation (URL changes) ===== */
function handleUrlChange() {
  const cid = getConvoId();
  if (cid !== lastConvoId) {
    lastConvoId = cid;
    lastLoggedNode = null;      // new chat, next assistant node is "new"
    lastPromptAtSend = "";      // clear prompt snapshot
    updateOverlayTotal();       // refresh overlay immediately
  }
}

function initUrlWatchers() {
  // Watch history changes
  addEventListener("popstate", handleUrlChange);
  // Poll occasionally in case the site uses pushState without popstate firing
  setInterval(handleUrlChange, 500);
}

/* ===== Init ===== */
function initOnceReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnceReady, { once: true });
    return;
  }
  ensureOverlay();
  updateOverlayTotal();
  setupInputHook();
  setupObserver();
  initUrlWatchers();
}

initOnceReady();
