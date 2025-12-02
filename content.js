// --- Minimal config for Wh ---
const DEFAULTS = {
  baselineWhPer500Tokens: 0.30, // Wh per 500 tokens (in+out)
  pue: 1.2,                     // datacenter overhead multiplier
  charsPerToken: 4              // fallback tokenizer heuristic
};

// Crank conversion: 15 crank rotations = 1 mWh
const CRANKS_PER_MWH = 15;

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

// Generate a stable message ID based on conversation and message position
// (not content, so it doesn't change during streaming)
function generateMessageId(convoId, messageIndex) {
  return `${convoId || 'unknown'}_msg_${messageIndex}`;
}

// Check if ChatGPT is currently streaming a response
function isStreaming() {
  // Look for the "Stop generating" button or streaming indicators
  const stopBtn = document.querySelector('[data-testid="stop-button"]');
  const streamingIndicator = document.querySelector('[data-testid="streaming"]');
  const thinkingIndicator = document.querySelector('.result-thinking');
  
  return !!(stopBtn || streamingIndicator || thinkingIndicator);
}

// Overlay UI
const ensureOverlay = () => {
  let el = document.getElementById("pem-overlay");
  if (el) return el;
  el = document.createElement("div");
  el.id = "pem-overlay";
  el.innerHTML = `<div id="pem-card">
      <div id="pem-title" style="font-variant:small-caps;">Prompt Energy (This Chat)</div>
      <div id="pem-body">
        <div id="pem-energy"><span id="pem-wh">0.000</span> Wh <span id="pem-mwh" style="opacity:0.7;">(0.00 mWh)</span></div>
        <div id="pem-crank" style="margin-top:4px;font-size:13px;">🔄 <span id="pem-cranks">0</span> cranks needed</div>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
};

const computeWh = ({ inTokens, outTokens, opts }) => {
  const totalTokens = Math.max(1, inTokens + outTokens);
  const whCore = opts.baselineWhPer500Tokens * (totalTokens / 500);
  return whCore * opts.pue;
};

// Get all user prompt nodes on the page
function getAllUserNodes() {
  return document.querySelectorAll('[data-message-author-role="user"]');
}

// Get all assistant message nodes on the page
function getAllAssistantNodes() {
  return document.querySelectorAll('[data-message-author-role="assistant"], [data-testid="bot"]');
}

// Scan all messages currently on the page and calculate total energy
async function scanAllMessagesOnPage() {
  const opts = await safeSyncGet(DEFAULTS);
  const userNodes = getAllUserNodes();
  const assistantNodes = getAllAssistantNodes();
  
  let totalWh = 0;
  let totalTokens = 0;
  
  for (let i = 0; i < assistantNodes.length; i++) {
    const assistantNode = assistantNodes[i];
    const outText = (assistantNode.innerText || assistantNode.textContent || "").trim();
    
    // Get corresponding user prompt (if available)
    let inText = "";
    if (i < userNodes.length) {
      inText = (userNodes[i].innerText || userNodes[i].textContent || "").trim();
    }
    
    const inTok = estimateTokens(inText, opts.charsPerToken);
    const outTok = estimateTokens(outText, opts.charsPerToken);
    const wh = computeWh({ inTokens: inTok, outTokens: outTok, opts });
    
    totalWh += wh;
    totalTokens += inTok + outTok;
  }
  
  return { totalWh, totalTokens, messageCount: assistantNodes.length };
}

async function updateOverlayTotal() {
  const overlay = ensureOverlay();
  
  // Scan all messages currently visible on the page
  const { totalWh, totalTokens, messageCount } = await scanAllMessagesOnPage();
  
  // Calculate mWh and cranks
  const totalMwh = totalWh * 1000;
  const totalCranks = Math.ceil(totalMwh * CRANKS_PER_MWH);
  
  // Update Wh display
  overlay.querySelector("#pem-wh").textContent = totalWh.toFixed(3);
  
  // Update mWh display
  const mwhEl = overlay.querySelector("#pem-mwh");
  if (mwhEl) {
    mwhEl.textContent = `(${totalMwh.toFixed(2)} mWh)`;
  }
  
  // Update cranks display
  const cranksEl = overlay.querySelector("#pem-cranks");
  if (cranksEl) {
    cranksEl.textContent = totalCranks.toLocaleString();
  }
  
  // Update the title to show message count for clarity
  const titleEl = overlay.querySelector("#pem-title");
  if (titleEl && messageCount > 0) {
    titleEl.textContent = `Prompt Energy (${messageCount} messages)`;
  } else if (titleEl) {
    titleEl.textContent = `Prompt Energy (This Chat)`;
  }
}

/* ===== State tracking ===== */
let lastConvoId = null;
let lastMessageCount = 0;
let updateDebounceTimer = null;
let loggedMessageIds = new Set(); // Track which messages we've already logged (by unique ID)

// Debounced update to avoid too many recalculations during streaming
function scheduleOverlayUpdate(delay = 300) {
  if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
  updateDebounceTimer = setTimeout(() => {
    updateOverlayTotal();
  }, delay);
}

// Track the last known text length to detect streaming
let lastTotalTextLength = 0;

// Log messages to storage (for the popup history view) with deduplication
async function logMessagesToHistory() {
  // Don't log while still streaming - wait for completion
  if (isStreaming()) {
    // Schedule another attempt after streaming might be done
    setTimeout(logMessagesToHistory, 2000);
    return;
  }
  
  const userNodes = getAllUserNodes();
  const assistantNodes = getAllAssistantNodes();
  const convoId = getConvoId();
  
  if (assistantNodes.length === 0) return;
  
  const opts = await safeSyncGet(DEFAULTS);
  const { history = [] } = await safeLocalGet('history', []);
  
  // Build a map of existing entries by messageId for updates
  const existingEntryMap = new Map();
  history.forEach((h, idx) => {
    if (h.messageId) {
      existingEntryMap.set(h.messageId, idx);
    }
  });
  
  let hasChanges = false;
  
  // Check each message on the page
  for (let i = 0; i < assistantNodes.length; i++) {
    const assistantNode = assistantNodes[i];
    const outText = (assistantNode.innerText || assistantNode.textContent || "").trim();
    
    // Skip if still empty or too short
    if (!outText || outText.length < 20) continue;
    
    // Generate stable ID for this message (doesn't change with content)
    const messageId = generateMessageId(convoId, i);
    
    // Get corresponding user prompt
    let inText = "";
    if (i < userNodes.length) {
      inText = (userNodes[i].innerText || userNodes[i].textContent || "").trim();
    }
    
    const inTok = estimateTokens(inText, opts.charsPerToken);
    const outTok = estimateTokens(outText, opts.charsPerToken);
    const wh = computeWh({ inTokens: inTok, outTokens: outTok, opts });
    const totalTokens = inTok + outTok;
    
    // Check if this message already exists in history
    if (existingEntryMap.has(messageId)) {
      // Update existing entry if the new values are larger (more complete)
      const existingIdx = existingEntryMap.get(messageId);
      const existing = history[existingIdx];
      
      if (totalTokens > existing.tokens) {
        // Message has grown - update the entry
        history[existingIdx] = {
          ...existing,
          tokens: totalTokens,
          wh: wh,
          ts: Date.now() // Update timestamp
        };
        hasChanges = true;
      }
    } else if (!loggedMessageIds.has(messageId)) {
      // New message - add it
      history.push({
        ts: Date.now(),
        tokens: totalTokens,
        wh,
        url: location.href,
        convoId: convoId,
        messageId: messageId
      });
      loggedMessageIds.add(messageId);
      hasChanges = true;
    }
  }
  
  if (hasChanges) {
    await safeLocalSet({ history });
  }
}

// Debounce timer for history logging
let logDebounceTimer = null;

// Check if the number of messages has changed (indicates new message added or page loaded)
function checkForMessageChanges() {
  const assistantNodes = getAllAssistantNodes();
  const currentCount = assistantNodes.length;
  
  // Calculate total text length to detect streaming updates
  let totalTextLength = 0;
  assistantNodes.forEach(node => {
    totalTextLength += (node.innerText || node.textContent || "").length;
  });
  
  // Update if message count changed or if text length changed significantly (streaming)
  if (currentCount !== lastMessageCount || Math.abs(totalTextLength - lastTotalTextLength) > 50) {
    lastMessageCount = currentCount;
    lastTotalTextLength = totalTextLength;
    scheduleOverlayUpdate(300); // Update overlay frequently during streaming
    
    // Debounce history logging - wait for text to stabilize
    // Clear previous timer and set a new one
    if (logDebounceTimer) clearTimeout(logDebounceTimer);
    logDebounceTimer = setTimeout(() => {
      logMessagesToHistory();
    }, 2000); // Wait 2 seconds after last change before logging
  }
}

/* ===== Observe DOM changes efficiently ===== */
let observer;

function setupObserver() {
  // Try multiple possible container selectors (ChatGPT updates their DOM structure)
  const root = document.querySelector('[data-testid="conversation-turns"]') 
            || document.querySelector('main')
            || document.body;

  // Mutation observer that reacts to message insertions and content changes
  observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    
    for (const m of mutations) {
      // Check for new nodes added
      if (m.addedNodes && m.addedNodes.length) {
        shouldUpdate = true;
        break;
      }
      // Also check for text content changes (streaming)
      if (m.type === 'characterData' || m.type === 'childList') {
        shouldUpdate = true;
        break;
      }
    }
    
    if (shouldUpdate) {
      checkForMessageChanges();
    }
  });

  observer.observe(root, { 
    childList: true, 
    subtree: true, 
    characterData: true 
  });
}

/* ===== Handle SPA navigation (URL changes) ===== */
function handleUrlChange() {
  const cid = getConvoId();
  if (cid !== lastConvoId) {
    lastConvoId = cid;
    lastMessageCount = 0; // Reset count so we rescan on new chat
    lastTotalTextLength = 0;
    // Note: We don't reset loggedMessageIds - the messageId system handles dedup across reloads
    
    // Wait a bit for the new chat's messages to load, then update
    setTimeout(() => {
      updateOverlayTotal();
      logMessagesToHistory(); // Log any existing messages in this chat
    }, 800);
  }
}

function initUrlWatchers() {
  // Watch history changes (back/forward)
  addEventListener("popstate", handleUrlChange);
  
  // Intercept pushState and replaceState for SPA navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(handleUrlChange, 100);
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    setTimeout(handleUrlChange, 100);
  };
  
  // Also poll as a fallback (some SPAs use other methods)
  setInterval(handleUrlChange, 1000);
}

/* ===== Init ===== */
function initOnceReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnceReady, { once: true });
    return;
  }
  
  // Create overlay immediately
  ensureOverlay();
  
  // Set up observers and watchers
  setupObserver();
  initUrlWatchers();
  
  // Initialize conversation ID
  lastConvoId = getConvoId();
  
  // Initial scan - wait a bit for ChatGPT to fully render messages
  setTimeout(() => {
    updateOverlayTotal();
    logMessagesToHistory();
  }, 1000);
  
  // Do another scan after more time in case messages load slowly
  setTimeout(() => {
    updateOverlayTotal();
    logMessagesToHistory();
  }, 3000);
  
  // Final pass to catch any remaining messages
  setTimeout(() => {
    logMessagesToHistory();
  }, 5000);
}

initOnceReady();
