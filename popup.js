// Crank conversion: 15 crank rotations = 1 mWh
const CRANKS_PER_MWH = 15;

/* ===== Safe helpers ===== */
function getChromeApi() {
  try { if (typeof chrome !== 'undefined' && chrome?.runtime?.id) return chrome; } catch(_) {}
  return null;
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
async function getActiveTab() {
  const c = getChromeApi();
  if (!c?.tabs) return null;
  try { const [tab] = await c.tabs.query({ active: true, currentWindow: true }); return tab || null; }
  catch { return null; }
}
function getConvoIdFromUrl(url) {
  try { const u = new URL(url); const m = u.pathname.match(/\/c\/([a-z0-9-]+)/i); return m ? m[1] : null; }
  catch { return null; }
}

/* ===== Per-chat color (diverse & deterministic) ===== */
function hashToHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}
function colorForConvo(convoId) {
  if (!convoId) return '#6b7280'; // neutral for unknown
  const hue = hashToHue(convoId);
  const sat = 70;  // %
  const lit = 45;  // %
  return `hsl(${hue} ${sat}% ${lit}%)`;
}

(async () => {
  const perchat = document.getElementById("perchat");
  const list = document.getElementById("list");

  const tab = await getActiveTab();
  const activeConvoId = tab ? getConvoIdFromUrl(tab.url || "") : null;

  const { history = [] } = await safeLocalGet('history', []);

  // --- This chat total ---
  if (activeConvoId) {
    const thisChat = history.filter(x => x.convoId === activeConvoId);
    if (thisChat.length) {
      const totalWh = thisChat.reduce((s, x) => s + (x.wh || 0), 0);
      const totalMwh = totalWh * 1000;
      const totalCranks = Math.ceil(totalMwh * CRANKS_PER_MWH);
      perchat.classList.remove("muted");
      perchat.innerHTML = `
        <div class="big">${totalWh.toFixed(3)} Wh</div>
        <div style="font-size:13px;opacity:0.8;">(${totalMwh.toFixed(2)} mWh)</div>
        <div style="margin-top:6px;">🔄 <strong>${totalCranks.toLocaleString()}</strong> cranks needed</div>
        <div style="margin-top:4px;font-size:12px;opacity:0.7;">${thisChat.length} prompt(s) in this chat</div>`;
    } else {
      perchat.textContent = "No entries logged for this chat yet.";
    }
  } else {
    perchat.textContent = "Open a specific conversation to see the total.";
  }

  // --- Global recent list (color-coded by chat) ---
  if (!history.length) return;
  list.classList.remove("muted");

  list.innerHTML = history.slice(-24).reverse().map(item => {
    const d   = new Date(item.ts).toLocaleTimeString();
    const tok = (item.tokens ?? 0);
    const wh  = (item.wh ?? 0);
    const mwh = wh * 1000;
    const cranks = Math.ceil(mwh * CRANKS_PER_MWH);
    const cid = item.convoId || '';
    const c   = colorForConvo(cid);

    // colored dot + colored numbers (same color per chat)
    return `<div class="row">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};flex:0 0 auto;"></span>
        <span>${d}</span>
      </div>
      <div style="text-align:right;">
        <span style="color:${c};font-weight:700;">${wh.toFixed(3)} Wh</span>
        <span style="color:${c};opacity:.7;font-size:11px;"> (${mwh.toFixed(1)} mWh)</span>
        <div style="color:${c};font-size:11px;">🔄 ${cranks} cranks</div>
      </div>
    </div>`;
  }).join("");

  // Clear history button
  document.getElementById("clearBtn").addEventListener("click", async () => {
    if (confirm("Clear all prompt history? This cannot be undone.")) {
      await safeLocalSet({ history: [] });
      perchat.textContent = "History cleared. Reload ChatGPT to start fresh.";
      perchat.classList.add("muted");
      list.innerHTML = "No data yet.";
      list.classList.add("muted");
    }
  });
})();
