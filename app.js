// ===================== ZyphraPOS - Beyond Point of Sale=====================

// ── Current Purchase Order (for print button) ──────────────────
let _currentPO = null;

// ==================== INTERNAL CHAT SYSTEM ====================
let _chatOpen       = false;
let _chatPeer       = null;    // username or "__all__"
let _chatMessages   = [];
let _chatUsers      = [];
let _chatPollTimer  = null;
let _chatHeartTimer = null;
let _chatSince      = 0;       // last received message ts (for incremental fetch)
let _chatUnread     = {};      // peer → unread count (only non-current peer)
let _chatSending    = false;   // debounce flag

const _tok = () => localStorage.getItem("pos_token") || "";

// ── Open / close ──────────────────────────────────────────────
async function openChatPanel() {
  _chatOpen = true;
  document.getElementById("chat-panel")?.classList.remove("hidden");
  await _chatLoadUsers();
  if (!_chatPeer) await chatSelectPeer("__all__");
  else            await _chatFetchMessages(true);   // full reload for existing peer
  _chatStartPoll();
  _chatStartHeartbeat();
  const badge = document.getElementById("chat-unread-badge");
  if (badge) badge.classList.add("hidden");
}

function closeChatPanel() {
  _chatOpen = false;
  document.getElementById("chat-panel")?.classList.add("hidden");
  clearInterval(_chatPollTimer);
  clearInterval(_chatHeartTimer);
}

// ── Users ─────────────────────────────────────────────────────
async function _chatLoadUsers() {
  try {
    const r = await fetch("/api/chat/users", { headers: { "x-pos-token": _tok() } });
    const d = await r.json();
    if (d.ok) { _chatUsers = d.users; _renderChatUserList(); }
  } catch {}
}

function _renderChatUserList() {
  const me   = currentUser;
  const list = document.getElementById("chat-user-list");
  if (!list) return;

  const unreadAll = _chatUnread["__all__"] || 0;
  let html = `
    <div class="chat-user-list-header">People</div>
    <div class="chat-user-item ${_chatPeer === '__all__' ? 'active' : ''}" onclick="chatSelectPeer('__all__')">
      <div class="chat-avatar chat-avatar-all"><i class="fas fa-globe"></i></div>
      <div class="chat-user-info">
        <div class="chat-user-name">Everyone</div>
        <div class="chat-user-sub">Group broadcast</div>
      </div>
      ${unreadAll ? `<span class="chat-user-badge">${unreadAll}</span>` : ''}
    </div>`;

  _chatUsers.filter(u => u.username !== me).forEach(u => {
    const initials  = (u.fullName || u.username).slice(0, 2).toUpperCase();
    const isActive  = _chatPeer === u.username;
    const unread    = _chatUnread[u.username] || 0;
    const avatarHtml = u.profilePic
      ? `<img src="${u.profilePic}" class="chat-avatar" alt="${initials}" />`
      : `<div class="chat-avatar chat-avatar-init">${initials}</div>`;

    html += `
      <div class="chat-user-item ${isActive ? 'active' : ''}" onclick="chatSelectPeer('${u.username.replace(/'/g,"\\'")}')">
        <div class="chat-avatar-wrap">${avatarHtml}
          <span class="chat-online-dot ${u.online ? 'online' : 'offline'}"></span>
        </div>
        <div class="chat-user-info">
          <div class="chat-user-name">${_escHtml(u.fullName || u.username)}</div>
          <div class="chat-user-sub">${_escHtml(u.role || '')}${u.online ? ' · online' : ''}</div>
        </div>
        ${unread ? `<span class="chat-user-badge">${unread}</span>` : ''}
      </div>`;
  });

  list.innerHTML = html;
}

// ── Select peer ───────────────────────────────────────────────
async function chatSelectPeer(peer) {
  _chatPeer     = peer;
  _chatMessages = [];
  _chatSince    = 0;
  delete _chatUnread[peer];
  _renderChatUserList();

  const titleEl = document.getElementById("chat-panel-title-text");
  if (titleEl) {
    if (peer === "__all__") {
      titleEl.textContent = "Everyone (Broadcast)";
    } else {
      const u = _chatUsers.find(u => u.username === peer);
      titleEl.textContent = u ? (u.fullName || u.username) : peer;
    }
  }

  const empty = document.getElementById("tc-empty");
  if (empty) empty.style.display = "none";

  await _chatFetchMessages(true);
}

// ── Fetch messages ────────────────────────────────────────────
async function _chatFetchMessages(full = false) {
  if (!_chatPeer) return;
  try {
    const since = full ? 0 : _chatSince;
    const r = await fetch(
      `/api/chat/messages?with=${encodeURIComponent(_chatPeer)}&since=${since}`,
      { headers: { "x-pos-token": _tok() } }
    );
    const d = await r.json();
    if (!d.ok) return;

    if (full) {
      _chatMessages = d.messages;
    } else {
      // Append only new messages (avoid duplicates)
      const existingIds = new Set(_chatMessages.map(m => m.id));
      d.messages.forEach(m => { if (!existingIds.has(m.id)) _chatMessages.push(m); });
    }

    if (d.messages.length) {
      _chatSince = Math.max(_chatSince, ...d.messages.map(m => m.ts));
    }

    _renderChatMessages();
  } catch {}
}

// ── Render messages ───────────────────────────────────────────
function _renderChatMessages() {
  const box = document.getElementById("tc-messages");
  if (!box) return;
  const me    = currentUser;
  const empty = document.getElementById("tc-empty");
  if (empty) empty.style.display = _chatMessages.length ? "none" : "flex";

  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

  box.innerHTML = _chatMessages.map(m => {
    const isMine  = m.from === me;
    const initials = (m.fromName || m.from).slice(0, 2).toUpperCase();
    const time     = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const avatar   = m.fromAvatar
      ? `<img src="${m.fromAvatar}" class="chat-msg-avatar" />`
      : `<div class="chat-msg-avatar chat-msg-avatar-init">${initials}</div>`;
    return `
      <div class="chat-msg-row ${isMine ? 'mine' : 'theirs'}">
        ${!isMine ? avatar : ''}
        <div class="chat-bubble-wrap">
          ${!isMine ? `<div class="chat-msg-name">${_escHtml(m.fromName || m.from)}</div>` : ''}
          <div class="chat-bubble">${_escHtml(m.text)}</div>
          <div class="chat-msg-time">${time}</div>
        </div>
        ${isMine ? avatar : ''}
      </div>`;
  }).join('');

  if (atBottom || _chatMessages.length <= 1) box.scrollTop = box.scrollHeight;
}

function _escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Send message ──────────────────────────────────────────────
async function chatSendMessage() {
  if (_chatSending) return;
  const input = document.getElementById("tc-input");
  if (!input) return;

  if (!_chatPeer) {
    showAppToast("⚠️ Select a person first", "#f59e0b", 2500);
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  _chatSending = true;
  input.value = "";
  input.disabled = true;

  try {
    const r = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pos-token": _tok() },
      body: JSON.stringify({ to: _chatPeer, text })
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();

    if (d.ok) {
      // Avoid duplicate: only add if not already in list
      if (!_chatMessages.find(m => m.id === d.message.id)) {
        _chatMessages.push(d.message);
        _chatSince = Math.max(_chatSince, d.message.ts);
      }
      _renderChatMessages();
    } else {
      input.value = text;   // restore on failure
      showAppToast("❌ " + (d.error || "Send failed"), "#ef4444", 3000);
    }
  } catch (e) {
    input.value = text;     // restore on failure
    showAppToast("❌ Failed to send: " + e.message, "#ef4444", 3000);
  } finally {
    _chatSending = false;
    input.disabled = false;
    input.focus();
  }
}

// ── Poll loop ─────────────────────────────────────────────────
function _chatStartPoll() {
  clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(async () => {
    await _chatLoadUsers();
    if (_chatPeer) await _chatFetchMessages(false);   // incremental
    await _chatUpdateUnread();
  }, 4000);
}

function _chatStartHeartbeat() {
  clearInterval(_chatHeartTimer);
  _chatHeartTimer = setInterval(() => {
    fetch("/api/chat/heartbeat", { method: "POST", headers: { "x-pos-token": _tok() } }).catch(() => {});
  }, 20000);
  fetch("/api/chat/heartbeat", { method: "POST", headers: { "x-pos-token": _tok() } }).catch(() => {});
}

// ── Unread badge (single API call, no N+1 loop) ───────────────
let _chatUnreadSince = 0;  // track what we've already counted

async function _chatUpdateUnread() {
  try {
    const me = currentUser;
    // Fetch all recent messages involving me
    const r = await fetch(
      `/api/chat/unread-all?since=${_chatUnreadSince}`,
      { headers: { "x-pos-token": _tok() } }
    );
    const d = await r.json();
    if (!d.ok) return;

    let totalNew = 0;
    d.messages.forEach(m => {
      if (m.from === me) return;                     // ignore my own
      const key = (m.to === "__all__") ? "__all__" : m.from;
      if (key === _chatPeer && _chatOpen) return;    // viewing this conversation now
      _chatUnread[key] = (_chatUnread[key] || 0) + 1;
      totalNew++;
    });

    if (d.messages.length) {
      _chatUnreadSince = Math.max(_chatUnreadSince, ...d.messages.map(m => m.ts));
    }

    if (totalNew) _renderChatUserList();

    const badge = document.getElementById("chat-unread-badge");
    if (badge) {
      const total = Object.values(_chatUnread).reduce((a, b) => a + b, 0);
      if (!_chatOpen && total > 0) {
        badge.textContent = total > 9 ? '9+' : total;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }
  } catch {}
}

// ── Keyboard shortcut ─────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement?.id === "tc-input") {
    e.preventDefault();
    chatSendMessage();
  }
});

// ==================== SESSION & AUTH ====================
const currentUser = localStorage.getItem("pos_logged_in");
if (!currentUser) {
  window.location.replace("/login");
}

let currentUserData = null;
try {
  const raw = localStorage.getItem("pos_user");
  currentUserData = raw ? JSON.parse(raw) : null;
} catch {
  currentUserData = null;
}

// If logged in but no role data (old session), treat as admin for backward compat
const isAdmin = () => !currentUserData || currentUserData.role === "admin";
const hasPermission = (view) => {
  if (!currentUserData) return true; // backward compat: old sessions get full access
  if (currentUserData.role === "admin") return true;
  return (
    Array.isArray(currentUserData.permissions) &&
    currentUserData.permissions.includes(view)
  );
};

const getStorageKey = (type) => `pos_${type}_${currentUser}`;

// ==================== GLOBAL STATE ====================
let products = [];
let customers = [];
let invoices = [];
let cart = [];
let expenses = [];
let categories = [];
let discountCodes = [];
let purchases = [];
let purchaseItems = [];
let quotations = [];
let shifts = [];
let suppliers = [];
let quoteCart = [];

// Billing state
let selectedBillingCustomerId = null;
let billingLoyaltyRedeemed = 0; // points the customer chose to redeem this sale
let editingQuotationId = null;

// Charts
let chartDaily = null,
  chartTop = null,
  chartCategory = null,
  chartHourly = null;
let analyticsPeriod = "week"; // today | week | month | year

// ==================== THEME SYSTEM ====================
const THEMES = ["classic-dark", "light-pro", "midnight-ocean"];
const THEME_KEY = "pos_theme";

function applyTheme(name) {
  const theme = THEMES.includes(name) ? name : "classic-dark";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll(".theme-card[data-theme-pick]").forEach((card) => {
    card.classList.toggle("active", card.dataset.themePick === theme);
  });
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "classic-dark";
  applyTheme(saved);
}

function refreshThemeCards() {
  const current = localStorage.getItem(THEME_KEY) || "classic-dark";
  document.querySelectorAll(".theme-card[data-theme-pick]").forEach((card) => {
    card.classList.toggle("active", card.dataset.themePick === current);
  });
  refreshFontSizeCards();
}

function getThemeName(key) {
  const names = {
    "classic-dark":    "Classic Dark",
    "light-pro":       "Light Pro",
    "midnight-ocean":  "Midnight Ocean",
  };
  return names[key] || key;
}

initTheme();

// ==================== FONT SIZE SYSTEM ====================
const FONTSIZE_KEY = "pos_fontsize";
const FONTSIZES = ["compact", "normal", "large"];

function applyFontSize(size) {
  const fs = FONTSIZES.includes(size) ? size : "normal";
  document.documentElement.setAttribute("data-fontsize", fs);
  localStorage.setItem(FONTSIZE_KEY, fs);
  refreshFontSizeCards();
}

function initFontSize() {
  const saved = localStorage.getItem(FONTSIZE_KEY) || "normal";
  applyFontSize(saved);
}

function refreshFontSizeCards() {
  const current = localStorage.getItem(FONTSIZE_KEY) || "normal";
  document.querySelectorAll(".fontsize-card[data-fontsize-pick]").forEach((card) => {
    card.classList.toggle("active", card.dataset.fontsizePick === current);
  });
}

function getFontSizeName(key) {
  const names = { compact: "Compact (12px)", normal: "Normal (14px)", large: "Large (16px)" };
  return names[key] || key;
}

initFontSize();

// ==================== UTILITY FUNCTIONS ====================
const $ = (sel) => document.querySelector(sel);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
const CFG = window.APP_CONFIG || {};
const CURRENCY_SYMBOL = CFG.currencySymbol || "Rs";
const CURRENCY_LOCALE = CFG.currencyLocale || "en-LK";
const CURRENCY_CODE = CFG.currencyCode || "LKR";
const LOW_STOCK_THRESH = CFG.lowStockThreshold ?? 5;
const DEFAULT_TAX = CFG.defaultTaxPercent ?? 0;
const APP_NAME = CFG.appName || "SD COMPUTERS";
const APP_TAGLINE = CFG.appTagline || "Next-Gen Point of Sale";
const BIZ_NAME = CFG.businessName || "SD COMPUTERS";
const BIZ_ADDRESS = CFG.businessAddress || "";
const BIZ_PHONE = CFG.businessPhone || "";
const BIZ_EMAIL = CFG.businessEmail || "";
const INVOICE_FOOTER = CFG.invoiceFooter || "Thank you for your purchase!";

const fmt = (n) => Number(n).toFixed(2);

let _toastTimer = null;
function showAppToast(msg, color = "#16a34a", duration = 4000) {
  let el = document.getElementById("app-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-toast";
    el.style.cssText =
      "position:fixed;bottom:28px;right:28px;max-width:340px;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;z-index:99999;box-shadow:0 4px 24px #0005;transition:opacity .4s;pointer-events:none;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = color;
  el.style.opacity = "1";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, duration);
}

const fmtCurrency = (n) => {
  try {
    return (
      "Rs.\u00a0" +
      Number(n).toLocaleString("en-LK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  } catch {
    return "Rs. " + Number(n).toFixed(2);
  }
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const timestamp = () => new Date().toISOString();
const genId = () => "id_" + Math.random().toString(36).slice(2, 9);
const TIMEZONE =
  CFG.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
const _dtFmt = {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};
const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
const formatDateTime = (iso) => new Date(iso).toLocaleString("en-GB", _dtFmt);

// ==================== DATA PERSISTENCE (FILE-BASED via API) ====================
async function apiGet(type) {
  const res = await fetch(`/api/data/${type}`);
  if (!res.ok) throw new Error(`Failed to load ${type}`);
  return res.json();
}

async function apiSave(type, data) {
  return fetch(`/api/data/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

async function loadAllData() {
  try {
    // ── One-time migration: move localStorage data into files ──────────────
    const legacyProducts = localStorage.getItem(getStorageKey("products"));
    if (legacyProducts) {
      console.log("Migrating localStorage data to server files...");
      const lProducts = JSON.parse(legacyProducts || "[]");
      const lInvoices = JSON.parse(
        localStorage.getItem(getStorageKey("invoices")) || "[]",
      );
      const lCustomers = JSON.parse(
        localStorage.getItem(getStorageKey("customers")) || "[]",
      );
      const lExpenses = JSON.parse(
        localStorage.getItem(getStorageKey("expenses")) || "[]",
      );
      const lCategories = JSON.parse(
        localStorage.getItem(getStorageKey("categories")) || "[]",
      );
      const lDiscounts = JSON.parse(
        localStorage.getItem(getStorageKey("discounts")) || "[]",
      );
      const lPurchases = JSON.parse(
        localStorage.getItem(getStorageKey("purchases")) || "[]",
      );

      await Promise.all([
        apiSave("products", lProducts),
        apiSave("invoices", lInvoices),
        apiSave("customers", lCustomers),
        apiSave("expenses", lExpenses),
        apiSave(
          "categories",
          lCategories.length
            ? lCategories
            : ["General", "Electronics", "Accessories", "Software", "Services"],
        ),
        apiSave("discounts", lDiscounts),
        apiSave("purchasing", lPurchases),
      ]);

      // Clear legacy localStorage keys
      [
        "products",
        "invoices",
        "customers",
        "expenses",
        "categories",
        "discounts",
        "purchases",
      ].forEach((t) => {
        localStorage.removeItem(getStorageKey(t));
      });
      console.log("Migration complete — data saved to database files.");
    }

    // ── Load all data from the server files ────────────────────────────────
    [
      products,
      invoices,
      customers,
      expenses,
      categories,
      discountCodes,
      purchases,
    ] = await Promise.all([
      apiGet("products"),
      apiGet("invoices"),
      apiGet("customers"),
      apiGet("expenses"),
      apiGet("categories"),
      apiGet("discounts"),
      apiGet("purchasing"),
      apiGet("quotations"),
      apiGet("shifts"),
      apiGet("suppliers"),
      apiGet("returns"),
    ]).then(arr => {
      quotations = Array.isArray(arr[7]) ? arr[7] : [];
      shifts = Array.isArray(arr[8]) ? arr[8] : [];
      suppliers = Array.isArray(arr[9]) ? arr[9] : [];
      returns = Array.isArray(arr[10]) ? arr[10] : [];
      return arr.slice(0, 7);
    });

    // ── Merge server settings into APP_CONFIG so L() works everywhere ─────
    try {
      const sRes = await fetch("/api/settings");
      if (sRes.ok) {
        const sData = await sRes.json();
        window.APP_CONFIG = window.APP_CONFIG || {};
        Object.assign(window.APP_CONFIG, sData);
      }
    } catch (_) {}

    // ── Normalise fields for older records ─────────────────────────────────
    products = products.map((p) => ({
      ...p,
      id: p.id || genId(),
      category: p.category || "General",
      sku: p.sku || p.code || genProductCode(),
    }));
    invoices = invoices.map((i) => {
      const pm = i.paymentMethod || "cash";
      const isCredit = pm === "credit";
      const total = Number(i.total) || 0;
      // Backfill credit fields for older invoices
      let paidAmount = i.paidAmount;
      if (paidAmount === undefined || paidAmount === null) {
        paidAmount = isCredit ? 0 : total;
      }
      paidAmount = Math.max(0, Math.min(total, Number(paidAmount) || 0));
      const creditAmount = Math.max(0, total - paidAmount);
      let creditStatus = i.creditStatus;
      if (!creditStatus) {
        if (!isCredit) creditStatus = "paid";
        else if (paidAmount <= 0) creditStatus = "unpaid";
        else if (creditAmount <= 0.001) creditStatus = "paid";
        else creditStatus = "partial";
      }
      // Backfill stockDeducted: old advance invoices had stock deducted at checkout,
      // so mark them as already deducted to prevent a second deduction on delivery.
      let stockDeducted = i.stockDeducted;
      if (stockDeducted === undefined || stockDeducted === null) {
        // New invoices set this explicitly; treat any existing invoice as already deducted
        stockDeducted = true;
      }
      return {
        ...i,
        customer: i.customer || null,
        paymentMethod: pm,
        paidAmount,
        creditAmount,
        creditStatus,
        payments: Array.isArray(i.payments) ? i.payments : [],
        stockDeducted,
      };
    });

    if (categories.length === 0) {
      categories = [
        "General",
        "Electronics",
        "Accessories",
        "Software",
        "Services",
      ];
    }
  } catch (err) {
    console.error("Failed to load data from server:", err);
    products = [];
    invoices = [];
    customers = [];
    expenses = [];
    categories = [
      "General",
      "Electronics",
      "Accessories",
      "Software",
      "Services",
    ];
    discountCodes = [];
    purchases = [];
  }
}

// Save only the specified data types (e.g. saveSome("products","invoices"))
function saveSome(...types) {
  const map = {
    products, invoices, customers, expenses,
    categories, discounts: discountCodes,
    purchasing: purchases, quotations, shifts, suppliers, returns,
  };
  for (const t of types) {
    if (t === "discounts") apiSave("discounts", discountCodes);
    else if (t === "purchasing") apiSave("purchasing", purchases);
    else if (map[t] !== undefined) apiSave(t, map[t]);
  }
  updateLowStockNavBadge();
  updateAdvanceNavBadge();
}

// Debounced full save — coalesces rapid successive calls into one
let _saveTimer = null;
function saveAllData() {
  updateLowStockNavBadge();
  updateAdvanceNavBadge();
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    apiSave("products", products);
    apiSave("invoices", invoices);
    apiSave("customers", customers);
    apiSave("expenses", expenses);
    apiSave("categories", categories);
    apiSave("discounts", discountCodes);
    apiSave("purchasing", purchases);
    apiSave("quotations", quotations);
    apiSave("shifts", shifts);
    apiSave("suppliers", suppliers);
    apiSave("returns", returns);
  }, 300);
}

function updateLowStockNavBadge() {
  const navBadge = $("#nav-low-stock-badge");
  if (!navBadge) return;
  const count = getLowStockProducts?.() ? getLowStockProducts().length : 0;
  if (count > 0) {
    navBadge.textContent = count;
    navBadge.classList.remove("hidden");
  } else {
    navBadge.classList.add("hidden");
  }
}

function updateAdvanceNavBadge() {
  const badge = $("#nav-advance-badge");
  if (!badge) return;
  const pendingCount = invoices.filter(
    (i) => i.paymentMethod === "advance" && (i.creditAmount || 0) > 0.001
  ).length;
  if (pendingCount > 0) {
    badge.textContent = String(pendingCount);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// ==================== PRODUCT MANAGEMENT ====================
function genProductCode() {
  let num = 1;
  const usedSkus = new Set([
    ...products.map((p) => p.sku),
    ...purchaseItems.map((i) => i.sku),
  ]);
  while (usedSkus.has(`ITEM${num.toString().padStart(4, "0")}`)) num++;
  return `ITEM${num.toString().padStart(4, "0")}`;
}

function updateSearchSuggestions() {
  const names = products.map((p) => p.name);
  const skus = products.map((p) => p.sku);
  const suggestions = [...new Set([...names, ...skus])];
  const makeOptions = () =>
    suggestions.map((s) => `<option value="${escapeHtml(s)}">`).join("");
  const dl1 = $("#product-search-suggestions");
  const dl2 = $("#billing-search-suggestions");
  const dl3 = $("#purchase-product-suggestions");
  if (dl1) dl1.innerHTML = makeOptions();
  if (dl2) dl2.innerHTML = makeOptions();
  if (dl3) dl3.innerHTML = makeOptions();
}

function renderProductsTable() {
  const tbody = $("#products-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  updateSearchSuggestions();

  // Update stats bar
  const totalVal = products.reduce((s, p) => s + (Number(p.price || 0) * Number(p.stock || 0)), 0);
  const lowCount = products.filter((p) => p.stock <= LOW_STOCK_THRESH && p.stock > 0).length;
  const outCount = products.filter((p) => p.stock <= 0).length;
  const catCount = [...new Set(products.map((p) => p.category).filter(Boolean))].length;
  const el = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  el("#prod-stat-total", products.length);
  el("#prod-stat-value", fmtCurrency(totalVal));
  el("#prod-stat-low", lowCount + outCount);
  el("#prod-stat-cats", catCount);

  const filtered = filterProducts();
  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--muted);"><i class="fas fa-box-open" style="font-size:28px;display:block;margin-bottom:10px;opacity:0.3;"></i>No products found</td></tr>';
    return;
  }

  // Category colour palette
  const catColors = ["#7c3aed","#0891b2","#16a34a","#b45309","#dc2626","#db2777","#0f766e","#4338ca"];
  const catMap = {};
  let catIdx = 0;
  const getCatColor = (cat) => {
    if (!cat) return "#6b7280";
    if (!catMap[cat]) { catMap[cat] = catColors[catIdx++ % catColors.length]; }
    return catMap[cat];
  };

  filtered.forEach((p) => {
    const isOut  = p.stock <= 0;
    const isLow  = !isOut && p.stock <= LOW_STOCK_THRESH;
    const stockPct = p.lowStockAlert ? Math.min(100, Math.round((p.stock / p.lowStockAlert) * 100)) : null;
    const catColor = getCatColor(p.category);

    let stockBadge;
    if (isOut)  stockBadge = `<span class="prod-stock-badge prod-stock-out"><i class="fas fa-times-circle"></i> Out of Stock</span>`;
    else if (isLow) stockBadge = `<span class="prod-stock-badge prod-stock-low"><i class="fas fa-exclamation-triangle"></i> ${p.stock} left</span>`;
    else        stockBadge = `<span class="prod-stock-badge prod-stock-ok"><i class="fas fa-check-circle"></i> ${p.stock} in stock</span>`;

    const tr = document.createElement("tr");
    tr.className = "prod-row";
    tr.innerHTML = `
      <td>
        <div class="prod-name-cell">
          <div class="prod-icon" style="background:${catColor}22;color:${catColor};">
            <i class="fas fa-box"></i>
          </div>
          <div class="prod-name-wrap">
            <div class="prod-name-main">${escapeHtml(p.name)}</div>
            <div class="prod-name-sub">
              <span class="prod-sku-tag">${escapeHtml(p.sku)}</span>
              ${p.barcode ? `<span class="prod-sku-tag" style="color:#a78bfa;border-color:#7c3aed33;">
                <i class="fas fa-barcode" style="font-size:8px;"></i> ${escapeHtml(p.barcode)}
              </span>` : ""}
            </div>
          </div>
        </div>
      </td>
      <td class="hide-mobile">
        <span class="prod-cat-badge" style="background:${catColor}20;color:${catColor};border-color:${catColor}40;">
          ${escapeHtml(p.category || "Uncategorised")}
        </span>
      </td>
      <td>
        <div class="prod-price-cell">
          <span class="prod-price">${fmtCurrency(p.price)}</span>
          ${p.costPrice ? `<span class="prod-cost">Cost: ${fmtCurrency(p.costPrice)}</span>` : ""}
          ${p.wholesalePrice ? `<span class="prod-cost" style="color:#8b5cf6;">WS: ${fmtCurrency(p.wholesalePrice)}</span>` : ""}
          ${p.bestPrice ? `<span class="prod-cost" style="color:#f97316;">Best: ${fmtCurrency(p.bestPrice)}</span>` : ""}
        </div>
      </td>
      <td>
        <div class="prod-stock-cell">
          ${stockBadge}
          ${stockPct !== null ? `<div class="prod-stock-bar"><div class="prod-stock-fill" style="width:${stockPct}%;background:${isLow ? '#f59e0b' : '#10b981'};"></div></div>` : ""}
        </div>
      </td>
      <td class="prod-actions-cell">
        <button class="cust-btn cust-btn-history product-history-btn" data-id="${p.id}" title="View History">
          <i class="fas fa-history"></i><span>History</span>
        </button>
        <button class="cust-btn cust-btn-edit edit-product" data-id="${p.id}">
          <i class="fas fa-pen"></i><span>Edit</span>
        </button>
        <button class="cust-btn cust-btn-delete delete-product" data-id="${p.id}">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachProductTableListeners();
  renderLowStockWidget();
}

function filterProducts() {
  const category = $("#product-category-filter")?.value || "all";
  const search = $("#product-search")?.value.toLowerCase().trim() || "";
  const low = $("#show-low-stock")?.checked || false;

  return products.filter((p) => {
    const matchCategory = category === "all" || p.category === category;
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search);
    const matchStock = !low || p.stock <= LOW_STOCK_THRESH;
    return matchCategory && matchSearch && matchStock;
  });
}

function attachProductTableListeners() {
  qsa(".edit-product").forEach((btn) =>
    btn.addEventListener("click", () =>
      openEditProductModal(btn.dataset.id),
    ),
  );
  qsa(".delete-product").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Delete this product?")) {
        products = products.filter((p) => p.id !== btn.dataset.id);
        saveAllData();
        renderProductsTable();
      }
    });
  });
  qsa(".product-history-btn").forEach((btn) =>
    btn.addEventListener("click", () => openProductHistory(btn.dataset.id))
  );
}

function openProductHistory(productId) {
  const p = products.find((x) => x.id === productId);
  if (!p) return;

  document.getElementById("ph-product-name").textContent = p.name;
  document.getElementById("ph-product-sku").textContent = p.sku;

  // ── Purchase history ──────────────────────────────────────────
  const purchaseHistory = [];
  (purchases || []).forEach((po) => {
    (po.items || []).forEach((item) => {
      if (item.id === p.id || item.sku === p.sku) {
        purchaseHistory.push({ po, item });
      }
    });
  });

  // ── Sales history ─────────────────────────────────────────────
  const salesHistory = [];
  (invoices || []).forEach((inv) => {
    (inv.items || []).forEach((item) => {
      if (item.id === p.id || item.sku === p.sku) {
        const cust = customers.find((c) => c.id === inv.customer);
        salesHistory.push({
          inv,
          item,
          customerName: inv.customerName || cust?.name || "Walk-in",
        });
      }
    });
  });

  // ── Return history ────────────────────────────────────────────
  const returnHistory = [];
  (returns || []).forEach((ret) => {
    (ret.items || []).forEach((item) => {
      if (item.productId === p.id || item.name === p.name) {
        returnHistory.push({ ret, item });
      }
    });
  });

  // ── Stats ─────────────────────────────────────────────────────
  const totalPurchased = purchaseHistory.reduce((s, x) => s + (x.item.qty || 0), 0);
  const totalSold      = salesHistory.reduce((s, x) => s + (x.item.qty || 0), 0);
  const totalReturned  = returnHistory.reduce((s, x) => s + (x.item.qty || 0), 0);

  document.getElementById("ph-stats").innerHTML = `
    <div class="ph-stat ph-stat-blue"><i class="fas fa-truck"></i><span>${totalPurchased}</span><label>Purchased</label></div>
    <div class="ph-stat ph-stat-green"><i class="fas fa-shopping-cart"></i><span>${totalSold}</span><label>Sold</label></div>
    <div class="ph-stat ph-stat-orange"><i class="fas fa-rotate-left"></i><span>${totalReturned}</span><label>Returned</label></div>
    <div class="ph-stat ph-stat-purple"><i class="fas fa-boxes"></i><span>${p.stock || 0}</span><label>In Stock</label></div>
  `;

  // ── Body HTML ─────────────────────────────────────────────────
  const empty = (msg) => `<div class="ph-empty"><i class="fas fa-inbox"></i> ${msg}</div>`;

  // Purchase section
  let poRows = purchaseHistory.length === 0 ? empty("No purchase records found") :
    purchaseHistory.map(({ po, item }) => `
      <div class="ph-entry">
        <div class="ph-entry-dot ph-dot-blue"></div>
        <div class="ph-entry-card">
          <div class="ph-entry-head">
            <span class="ph-entry-name"><i class="fas fa-building" style="color:#60a5fa;margin-right:5px;"></i>${escapeHtml(po.supplierName || po.supplier || "Unknown Supplier")}</span>
            <span class="ph-entry-ref">${escapeHtml(po.id)}</span>
          </div>
          <div class="ph-entry-chips">
            <span class="ph-chip"><i class="fas fa-calendar-alt"></i> ${formatDate(po.date)}</span>
            <span class="ph-chip"><i class="fas fa-layer-group"></i> Qty: <strong>${item.qty}</strong></span>
            <span class="ph-chip"><i class="fas fa-tag"></i> Cost: <strong>${fmtCurrency(item.costPrice || 0)}</strong></span>
            ${item.supplierSerial ? `<span class="ph-chip ph-chip-accent"><i class="fas fa-barcode"></i> S/N: ${escapeHtml(item.supplierSerial)}</span>` : ""}
          </div>
        </div>
      </div>`).join("");

  // Sales section
  let saleRows = salesHistory.length === 0 ? empty("No sales records found") :
    salesHistory.map(({ inv, item, customerName }) => `
      <div class="ph-entry">
        <div class="ph-entry-dot ph-dot-green"></div>
        <div class="ph-entry-card">
          <div class="ph-entry-head">
            <span class="ph-entry-name"><i class="fas fa-user" style="color:#34d399;margin-right:5px;"></i>${escapeHtml(customerName)}</span>
            <span class="ph-entry-ref">${escapeHtml(inv.id)}</span>
          </div>
          <div class="ph-entry-chips">
            <span class="ph-chip"><i class="fas fa-calendar-alt"></i> ${formatDate(inv.date)}</span>
            <span class="ph-chip"><i class="fas fa-layer-group"></i> Qty: <strong>${item.qty}</strong></span>
            <span class="ph-chip"><i class="fas fa-tag"></i> ${fmtCurrency(item.price || 0)}</span>
            ${item.serialNo ? `<span class="ph-chip ph-chip-accent"><i class="fas fa-barcode"></i> S/N: ${escapeHtml(item.serialNo)}</span>` : ""}
            <span class="ph-chip ph-chip-${inv.paymentMethod === "credit" ? "orange" : "green"}">${inv.paymentMethod || "—"}</span>
          </div>
        </div>
      </div>`).join("");

  // Returns section
  let retRows = returnHistory.length === 0 ? empty("No return records found") :
    returnHistory.map(({ ret, item }) => {
      const party = ret.type === "customer" ? ret.customerName : ret.supplierName;
      return `
      <div class="ph-entry">
        <div class="ph-entry-dot ph-dot-orange"></div>
        <div class="ph-entry-card">
          <div class="ph-entry-head">
            <span class="ph-entry-name"><i class="fas fa-rotate-left" style="color:#fb923c;margin-right:5px;"></i>${escapeHtml(party || "—")}</span>
            <span class="ph-entry-ref">${escapeHtml(ret.id)}</span>
          </div>
          <div class="ph-entry-chips">
            <span class="ph-chip"><i class="fas fa-calendar-alt"></i> ${formatDate(ret.date)}</span>
            <span class="ph-chip"><i class="fas fa-layer-group"></i> Qty: <strong>${item.qty}</strong></span>
            <span class="ph-chip ph-chip-${ret.type === "customer" ? "orange" : "blue"}">${ret.type === "customer" ? "Customer Return" : "Supplier Return"}</span>
            ${ret.reason ? `<span class="ph-chip"><i class="fas fa-comment"></i> ${escapeHtml(ret.reason)}</span>` : ""}
            ${ret.referenceId ? `<span class="ph-chip"><i class="fas fa-link"></i> ${escapeHtml(ret.referenceId)}</span>` : ""}
          </div>
        </div>
      </div>`;
    }).join("");

  document.getElementById("ph-body").innerHTML = `
    <div class="ph-section">
      <div class="ph-section-hdr ph-hdr-blue">
        <i class="fas fa-truck"></i> Purchase History
        <span class="ph-count-badge">${purchaseHistory.length}</span>
      </div>
      <div class="ph-entries">${poRows}</div>
    </div>
    <div class="ph-section">
      <div class="ph-section-hdr ph-hdr-green">
        <i class="fas fa-shopping-cart"></i> Sales History
        <span class="ph-count-badge">${salesHistory.length}</span>
      </div>
      <div class="ph-entries">${saleRows}</div>
    </div>
    <div class="ph-section">
      <div class="ph-section-hdr ph-hdr-orange">
        <i class="fas fa-rotate-left"></i> Return History
        <span class="ph-count-badge">${returnHistory.length}</span>
      </div>
      <div class="ph-entries">${retRows}</div>
    </div>
  `;

  document.getElementById("product-history-modal").classList.remove("hidden");
}

// ==================== CUSTOMER MANAGEMENT ====================
function renderCustomersTable(filter = "") {
  const tbody = $("#customers-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = filter.toLowerCase();
  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      (c.email && c.email.toLowerCase().includes(query)) ||
      (c.phone && c.phone.toLowerCase().includes(query)),
  );

  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center; padding:20px;">No matching customers</td></tr>';
    return;
  }

  // Color palette for avatar backgrounds (deterministic by name)
  const avatarColors = [
    "#6366f1",
    "#8b5cf6",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
    "#3b82f6",
    "#ef4444",
    "#14b8a6",
    "#f97316",
  ];
  const pickColor = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++)
      h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return avatarColors[h % avatarColors.length];
  };

  filtered.forEach((c) => {
    const totalPurchases = invoices
      .filter((i) => i.customer === c.id)
      .reduce((s, i) => s + i.total, 0);
    const purchaseCount = invoices.filter((i) => i.customer === c.id).length;
    const hasPhone = !!(c.phone && c.phone.trim());
    const tagsHtml =
      (c.tags || [])
        .map((t) => `<span class="cust-tag">${escapeHtml(t)}</span>`)
        .join("") || '<span class="cust-empty">—</span>';

    const initial = (c.name || "?").trim().charAt(0).toUpperCase();
    const color = pickColor(c.name || "?");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="cust-name-cell">
          <div class="cust-avatar" style="background:${color};">${escapeHtml(initial)}</div>
          <div class="cust-name-wrap">
            <div class="cust-name">${escapeHtml(c.name)}</div>
            <div class="cust-sub">${purchaseCount} ${purchaseCount === 1 ? "order" : "orders"}</div>
          </div>
        </div>
      </td>
      <td class="hide-sm">${tagsHtml}</td>
      <td class="hide-sm"><span class="cust-total">${fmtCurrency(totalPurchases)}</span></td>
      <td class="cust-actions">
        <button class="cust-btn cust-btn-info info-customer" data-id="${c.id}" title="View contact info">
          <i class="fas fa-circle-info"></i><span>Info</span>
        </button>
        <button class="cust-btn cust-btn-edit edit-customer" data-id="${c.id}" title="Edit">
          <i class="fas fa-pen"></i><span>Edit</span>
        </button>
        <button class="cust-btn cust-btn-wa wa-customer" data-id="${c.id}" title="WhatsApp"
          ${!hasPhone ? 'disabled title="No phone number"' : ""}>
          <i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span>
        </button>
        <button class="cust-btn cust-btn-delete delete-customer" data-id="${c.id}" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  qsa(".info-customer").forEach((btn) =>
    btn.addEventListener("click", (e) =>
      openCustomerInfoModal(e.currentTarget.dataset.id),
    ),
  );
  qsa(".edit-customer").forEach((btn) =>
    btn.addEventListener("click", (e) =>
      openEditCustomerModal(e.currentTarget.dataset.id),
    ),
  );
  qsa(".delete-customer").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm("Delete this customer?")) {
        customers = customers.filter((c) => c.id !== id);
        saveAllData();
        renderCustomersTable(filter);
      }
    });
  });
  qsa(".wa-customer").forEach((btn) =>
    btn.addEventListener("click", (e) =>
      openWAMessageModal(e.target.closest("button").dataset.id),
    ),
  );
}

// ==================== WHATSAPP MESSAGE MODAL ====================
let waTargetCustomerId = null;

function openWAMessageModal(customerId) {
  const c = customers.find((x) => x.id === customerId);
  if (!c) return;
  waTargetCustomerId = customerId;
  if ($("#wa-customer-name")) $("#wa-customer-name").textContent = c.name;
  if ($("#wa-customer-phone"))
    $("#wa-customer-phone").textContent = c.phone || "";
  if ($("#wa-message-text"))
    $("#wa-message-text").value =
      `Hello ${c.name},\n\nThank you for being a valued customer of SD Computers.\n\n`;
  $("#wa-message-modal")?.classList.remove("hidden");
  setTimeout(() => $("#wa-message-text")?.focus(), 100);
}

function closeWAMessageModal() {
  waTargetCustomerId = null;
  $("#wa-message-modal")?.classList.add("hidden");
}

async function sendWAMessage() {
  const c = customers.find((x) => x.id === waTargetCustomerId);
  if (!c || !c.phone) return;
  const message = $("#wa-message-text")?.value.trim();
  if (!message) {
    alert("Please type a message first.");
    return;
  }

  const btn = $("#wa-modal-send");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending…";
  }

  try {
    const res = await fetch("/api/whatsapp/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: c.phone, message }),
    });
    const data = await res.json();
    if (data.ok) {
      alert(`✅ Message sent to ${c.name}!`);
      closeWAMessageModal();
    } else {
      alert("❌ Failed: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Send via WhatsApp";
    }
  }
}

// ==================== BROADCAST WHATSAPP ====================
function getBroadcastTargets() {
  const tag = $("#broadcast-tag-filter")?.value || "";
  return customers.filter((c) => {
    if (!(c.phone && String(c.phone).trim())) return false;
    if (tag && !(Array.isArray(c.tags) && c.tags.includes(tag))) return false;
    return true;
  });
}

function refreshBroadcastCount() {
  const cnt = $("#broadcast-count");
  if (cnt) cnt.textContent = getBroadcastTargets().length;
}

function openBroadcastModal() {
  const sel = $("#broadcast-tag-filter");
  if (sel) {
    const allTags = Array.from(
      new Set(customers.flatMap((c) => c.tags || [])),
    ).sort();
    sel.innerHTML =
      '<option value="">All customers with phone</option>' +
      allTags
        .map(
          (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`,
        )
        .join("");
  }
  refreshBroadcastCount();
  const txt = $("#broadcast-text");
  if (txt && !txt.value)
    txt.value = `Hello {name},\n\nThank you for being a valued customer of ${BIZ_NAME || "our store"}.\n\n`;
  const prog = $("#broadcast-progress");
  if (prog) {
    prog.style.display = "none";
    prog.textContent = "";
  }
  $("#broadcast-modal")?.classList.remove("hidden");
  setTimeout(() => $("#broadcast-text")?.focus(), 100);
}

function closeBroadcastModal() {
  $("#broadcast-modal")?.classList.add("hidden");
}

async function sendBroadcast() {
  const template = ($("#broadcast-text")?.value || "").trim();
  if (!template) {
    alert("Please type a message first.");
    return;
  }
  const targets = getBroadcastTargets();
  if (targets.length === 0) {
    alert("No matching customers with phone numbers.");
    return;
  }
  if (!confirm(`Send this message to ${targets.length} customer(s)?`)) return;

  const btn = $("#broadcast-send");
  const prog = $("#broadcast-progress");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending…";
  }
  if (prog) {
    prog.style.display = "block";
  }

  let ok = 0,
    fail = 0;
  const failed = [];
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    if (prog)
      prog.textContent = `Sending ${i + 1} of ${targets.length}: ${c.name}…`;
    const message = template.replace(/\{name\}/gi, c.name || "Customer");
    try {
      const res = await fetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: c.phone, message }),
      });
      const data = await res.json();
      if (data.ok) ok++;
      else {
        fail++;
        failed.push(`${c.name}: ${data.error || "failed"}`);
      }
    } catch (err) {
      fail++;
      failed.push(`${c.name}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  if (prog) prog.textContent = `Done. ✅ ${ok} sent, ❌ ${fail} failed.`;
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Send to All";
  }
  alert(
    `Broadcast complete.\n✅ Sent: ${ok}\n❌ Failed: ${fail}` +
      (failed.length ? `\n\n${failed.slice(0, 10).join("\n")}` : ""),
  );
}

// ==================== BILLING CUSTOMER SEARCH ====================
function initBillingCustomerSearch() {
  const input = $("#customer-search");
  const dropdown = $("#customer-dropdown");
  if (!input || !dropdown) return;

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    if (!q) {
      dropdown.classList.add("hidden");
      return;
    }

    const matches = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)),
    );

    if (matches.length === 0) {
      dropdown.classList.add("hidden");
      return;
    }

    dropdown.innerHTML = matches
      .slice(0, 8)
      .map(
        (c) => `
      <div class="customer-dropdown-item" data-id="${c.id}">
        <strong>${escapeHtml(c.name)}</strong>
        <small>${c.phone || ""} ${c.email ? "· " + c.email : ""}</small>
      </div>
    `,
      )
      .join("");
    dropdown.classList.remove("hidden");

    dropdown.querySelectorAll(".customer-dropdown-item").forEach((item) => {
      item.addEventListener("click", () =>
        selectBillingCustomer(item.dataset.id),
      );
    });
  });

  input.addEventListener("blur", () => {
    setTimeout(() => dropdown.classList.add("hidden"), 200);
  });

  const clearBtn = $("#clear-customer-btn");
  if (clearBtn) clearBtn.addEventListener("click", clearBillingCustomer);
}

function selectBillingCustomer(id) {
  const c = customers.find((x) => x.id === id);
  if (!c) return;
  selectedBillingCustomerId = id;
  billingLoyaltyRedeemed = 0;

  const wrapper = $("#customer-search-wrapper");
  const dropdown = $("#customer-dropdown");
  const badge = $("#selected-customer-badge");
  const nameSpan = $("#selected-customer-name");
  const input = $("#customer-search");

  if (input) input.value = "";
  if (dropdown) dropdown.classList.add("hidden");
  if (wrapper) wrapper.classList.add("hidden");
  if (badge) badge.classList.remove("hidden");
  if (nameSpan)
    nameSpan.textContent = `${c.name}${c.phone ? " · " + c.phone : ""}`;

  updateBillingLoyaltyCard();
}

function clearBillingCustomer() {
  selectedBillingCustomerId = null;
  billingLoyaltyRedeemed = 0;
  const wrapper = $("#customer-search-wrapper");
  const badge = $("#selected-customer-badge");
  const input = $("#customer-search");
  if (input) input.value = "";
  if (wrapper) wrapper.classList.remove("hidden");
  if (badge) badge.classList.add("hidden");
  updateBillingLoyaltyCard();
}

// ==================== BILLING PRODUCT SEARCH ====================
function initBillingProductSearch() {
  const input = $("#search-products");
  const dropdown = $("#billing-product-dropdown");
  if (!input || !dropdown) return;

  updateSearchSuggestions();

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    if (!q) {
      dropdown.classList.add("hidden");
      return;
    }

    // Barcode exact-match fast path: if product has matching barcode, auto-add
    const exactBarcode = products.find(
      (p) => p.barcode && p.barcode.toLowerCase() === q,
    );
    if (exactBarcode && exactBarcode.stock > 0) {
      const qty = Math.max(1, Number($("#billing-add-qty")?.value) || 1);
      addToCart(exactBarcode.id, qty);
      input.value = "";
      const qtyInput = $("#billing-add-qty");
      if (qtyInput) qtyInput.value = 1;
      dropdown.classList.add("hidden");
      return;
    }

    const matches = products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)),
      )
      .slice(0, 12);

    if (matches.length === 0) {
      dropdown.classList.add("hidden");
      return;
    }

    dropdown.innerHTML = matches
      .map((p) => {
        const outOfStock = p.stock === 0;
        return `
        <div class="billing-product-item ${outOfStock ? "out-of-stock" : ""}" data-id="${p.id}">
          <div class="bpi-info">
            <strong>${escapeHtml(p.name)}</strong>
            <small>${escapeHtml(p.sku)} · ${fmtCurrency(p.price)}</small>
          </div>
          <div class="bpi-stock" style="color:${outOfStock ? "var(--danger)" : "var(--muted)"}">
            ${outOfStock ? "Out of stock" : "Stock: " + p.stock}
          </div>
        </div>
      `;
      })
      .join("");

    dropdown.classList.remove("hidden");

    dropdown
      .querySelectorAll(".billing-product-item:not(.out-of-stock)")
      .forEach((item) => {
        item.addEventListener("click", () => {
          const qty = Math.max(1, Number($("#billing-add-qty")?.value) || 1);
          addToCart(item.dataset.id, qty);
          input.value = "";
          const qtyInput = $("#billing-add-qty");
          if (qtyInput) qtyInput.value = 1;
          dropdown.classList.add("hidden");
          input.focus();
        });
      });
  });

  input.addEventListener("blur", () => {
    setTimeout(() => dropdown.classList.add("hidden"), 200);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      dropdown.classList.add("hidden");
    }
  });
}

function addToCart(id, qty) {
  const p = products.find((x) => x.id === id);
  if (!p) {
    alert("Product not found");
    return;
  }
  if (p.stock < qty) {
    alert(`Insufficient stock! Available: ${p.stock}`);
    return;
  }

  const existing = cart.find((c) => c.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      price: p.price,
      qty,
      category: p.category,
      discountPct: 0,
      serialNo: "",
    });
  }
  renderCart();
}

function getItemLineTotal(item) {
  const gross = item.price * item.qty;
  const disc =
    gross * (Math.max(0, Math.min(100, item.discountPct || 0)) / 100);
  return gross - disc;
}

function renderCart() {
  const el = $("#cart-items");
  if (!el) return;
  el.innerHTML = "";

  // Update badge and empty hint
  const badge = $("#cart-item-count");
  const hint = $("#cart-empty-hint");
  if (badge)
    badge.textContent = cart.length + (cart.length === 1 ? " item" : " items");
  if (hint) hint.style.display = cart.length === 0 ? "" : "none";

  if (cart.length > 0) {
    cart.forEach((item) => {
      const gross = item.price * item.qty;
      const lineTotal = getItemLineTotal(item);
      const hasDisc = item.discountPct > 0;

      const row = document.createElement("div");
      row.className = "cart-row";
      row.innerHTML = `
        <div class="cart-row-info">
          <strong>${escapeHtml(item.name)}</strong>
          <div class="cart-meta">${item.sku} · ${fmtCurrency(item.price)} each</div>
        </div>
        <div class="cart-row-controls">
          <div class="qty-control">
            <button class="qty-btn dec" data-id="${item.id}">−</button>
            <span>${item.qty}</span>
            <button class="qty-btn inc" data-id="${item.id}">+</button>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
            <span style="font-size:10px;color:var(--muted);">Disc %</span>
            <input class="item-discount-input" data-id="${item.id}" type="number" value="${item.discountPct || 0}" min="0" max="100" step="1" title="Item Discount %" />
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;">
            <span style="font-size:10px;color:var(--muted);">Serial No.</span>
            <input class="item-serial-input" data-id="${item.id}" type="text" value="${escapeHtml(item.serialNo || "")}" placeholder="e.g. SN12345" title="Company Serial Number" style="width:110px;" />
          </div>
          <div class="cart-row-total">
            ${hasDisc ? `<div class="original-total">${fmtCurrency(gross)}</div>` : ""}
            <div class="line-total">${fmtCurrency(lineTotal)}</div>
            <button class="small remove-item" data-id="${item.id}" style="margin-top:4px;">Remove</button>
          </div>
        </div>
      `;
      el.appendChild(row);
    });
  }

  qsa(".qty-btn.inc").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const it = cart.find((x) => x.id === e.target.dataset.id);
      if (it) {
        it.qty++;
        renderCart();
      }
    });
  });
  qsa(".qty-btn.dec").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const it = cart.find((x) => x.id === e.target.dataset.id);
      if (it && it.qty > 1) {
        it.qty--;
        renderCart();
      }
    });
  });
  qsa(".remove-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      cart = cart.filter((x) => x.id !== e.target.dataset.id);
      renderCart();
    });
  });
  qsa(".item-discount-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const it = cart.find((x) => x.id === e.target.dataset.id);
      if (it) {
        it.discountPct = Math.max(
          0,
          Math.min(100, Number(e.target.value) || 0),
        );
        updateCartTotals();
      }
    });
  });
  qsa(".item-serial-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const it = cart.find((x) => x.id === e.target.dataset.id);
      if (it) it.serialNo = e.target.value;
    });
  });
  updateCartTotals();
}

function updateCartTotals() {
  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const itemDiscountTotal = cart.reduce((s, c) => {
    const gross = c.price * c.qty;
    return s + gross * ((c.discountPct || 0) / 100);
  }, 0);
  const afterItemDisc = subtotal - itemDiscountTotal;

  const discountPct = Math.max(0, Number($("#discount-percent")?.value) || 0);
  const discountAmt = Math.max(
    0,
    Number($("#discount-amount-input")?.value) || 0,
  );
  const taxPct = Math.max(0, Number($("#tax-percent")?.value) || 0);

  const overallDiscount = Math.min(
    afterItemDisc,
    discountAmt + (afterItemDisc * discountPct) / 100,
  );
  const afterOverall = afterItemDisc - overallDiscount;
  const tax = afterOverall * (taxPct / 100);
  const total = afterOverall + tax;

  const sub = $("#subtotal");
  const idd = $("#item-discount-display");
  const dd = $("#discount-display");
  const td = $("#tax-display");
  const gt = $("#grand-total");

  if (sub) sub.textContent = fmt(subtotal);
  if (idd) idd.textContent = fmt(itemDiscountTotal);
  if (dd) dd.textContent = fmt(overallDiscount);
  if (td) td.textContent = fmt(tax);
  if (gt) gt.textContent = fmt(total);

  // Refresh credit/advance balance preview if relevant pill is selected
  const pm = $("#payment-method")?.value;
  if (pm === "credit") updateCreditBalanceDisplay();
  if (pm === "advance") updateAdvanceBalanceDisplay();
}

function checkout() {
  if (cart.length === 0) {
    alert("Cart is empty");
    return;
  }

  const docType = $("#doc-type")?.value || "invoice";
  const paymentMethod = $("#payment-method")?.value || "cash";

  // Credit payment requires a customer
  if (paymentMethod === "credit" && !selectedBillingCustomerId) {
    alert("⚠️ Please select a customer before issuing a credit invoice.");
    return;
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const itemDiscountTotal = cart.reduce((s, c) => {
    const gross = c.price * c.qty;
    return s + gross * ((c.discountPct || 0) / 100);
  }, 0);
  const afterItemDisc = subtotal - itemDiscountTotal;

  const discountPct = Math.max(0, Number($("#discount-percent")?.value) || 0);
  const discountAmt = Math.max(
    0,
    Number($("#discount-amount-input")?.value) || 0,
  );
  const taxPct = Math.max(0, Number($("#tax-percent")?.value) || 0);

  // Loyalty redemption (cash discount from points)
  const loyCfg = getLoyaltyConfig();
  let loyaltyDiscount = 0;
  let loyaltyRedeemedPts = 0;
  if (
    loyCfg.enabled &&
    selectedBillingCustomerId &&
    billingLoyaltyRedeemed > 0
  ) {
    const cust = customers.find((c) => c.id === selectedBillingCustomerId);
    const available = Number(cust?.loyaltyPoints) || 0;
    loyaltyRedeemedPts = Math.min(available, Math.floor(billingLoyaltyRedeemed));
    loyaltyDiscount = (loyaltyRedeemedPts / 100) * (Number(loyCfg.redeemRate) || 50);
  }

  const overallDiscount = Math.min(
    afterItemDisc,
    discountAmt + (afterItemDisc * discountPct) / 100 + loyaltyDiscount,
  );
  const afterOverall = afterItemDisc - overallDiscount;
  const tax = afterOverall * (taxPct / 100);
  const total = afterOverall + tax;

  // For advance orders, stock is held until delivery — deduct only on delivery confirmation
  if (paymentMethod !== "advance") {
    cart.forEach((ci) => {
      const p = products.find((x) => x.id === ci.id);
      if (p) p.stock = Math.max(0, p.stock - ci.qty);
    });
  }

  const prefix = docType === "receipt" ? "REC" : "INV";
  const existingNums = invoices.map((i) => {
    const m = i.id && i.id.match(/^(?:INV|REC)-(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  });
  const nextNum = (existingNums.length ? Math.max(...existingNums) : 0) + 1;
  const invoiceId = `${prefix}-${String(nextNum).padStart(4, "0")}`;

  // Credit / Advance calculations
  let paidAmount = total;
  let creditAmount = 0;
  let creditStatus = "paid";
  if (paymentMethod === "credit") {
    const paidNow = Math.max(
      0,
      Math.min(total, Number($("#credit-paid-now")?.value) || 0),
    );
    paidAmount = paidNow;
    creditAmount = total - paidNow;
    creditStatus =
      creditAmount <= 0.001 ? "paid" : paidNow <= 0 ? "unpaid" : "partial";
  } else if (paymentMethod === "advance") {
    const advPaid = Math.max(
      0,
      Math.min(total, Number($("#advance-paid-now")?.value) || 0),
    );
    paidAmount = advPaid;
    creditAmount = total - advPaid;
    creditStatus =
      creditAmount <= 0.001 ? "paid" : advPaid <= 0 ? "unpaid" : "partial";
  }

  const invoice = {
    id: invoiceId,
    date: timestamp(),
    customer: selectedBillingCustomerId,
    docType,
    items: cart.map((c) => {
      const prod = products.find((x) => x.id === c.id);
      const item = {
        id: c.id,
        sku: c.sku,
        name: c.name,
        price: c.price,
        qty: c.qty,
        discountPct: c.discountPct || 0,
        serialNo: c.serialNo || "",
        lineTotal: getItemLineTotal(c),
      };
      if (prod && prod.warrantyMonths) item.warrantyMonths = prod.warrantyMonths;
      return item;
    }),
    subtotal,
    itemDiscountTotal,
    discountPct,
    discountAmt: overallDiscount,
    taxPct,
    taxAmt: tax,
    total,
    paymentMethod,
    paidAmount,
    creditAmount,
    creditStatus,
    payments:
      (paymentMethod === "credit" || paymentMethod === "advance") && paidAmount > 0
        ? [
            {
              date: timestamp(),
              amount: paidAmount,
              method: "cash",
              note: paymentMethod === "advance" ? "Advance payment at checkout" : "Initial payment at checkout",
              by: currentUser || "unknown",
            },
          ]
        : [],
    notes: ($("#billing-invoice-note")?.value || "").trim(),
    status: "completed",
    soldBy: currentUser || "unknown",
    // Advance orders: stock is deducted only when delivery is confirmed
    stockDeducted: paymentMethod !== "advance",
  };

  // Loyalty: record redemption + earn new points
  if (loyCfg.enabled && selectedBillingCustomerId) {
    const cust = customers.find((c) => c.id === selectedBillingCustomerId);
    if (cust) {
      cust.loyaltyPoints = Number(cust.loyaltyPoints) || 0;
      // Deduct redeemed points first
      if (loyaltyRedeemedPts > 0) {
        cust.loyaltyPoints = Math.max(0, cust.loyaltyPoints - loyaltyRedeemedPts);
        invoice.loyaltyRedeemedPts = loyaltyRedeemedPts;
        invoice.loyaltyDiscount = loyaltyDiscount;
      }
      // Earn new points (1 pt per earnRate Rs spent — based on paidAmount)
      const earnRate = Number(loyCfg.earnRate) || 100;
      const earned = Math.floor((paidAmount || 0) / earnRate);
      if (earned > 0) {
        cust.loyaltyPoints += earned;
        invoice.loyaltyEarnedPts = earned;
      }
    }
  }

  invoices.push(invoice);
  saveAllData();
  // Reset billing-side loyalty redemption
  billingLoyaltyRedeemed = 0;
  $("#bl-redeem-input") && ($("#bl-redeem-input").value = "");
  $("#bl-redeem-applied")?.classList.add("hidden");

  // Send via WhatsApp if customer has a phone number (invoice OR receipt)
  if (invoice.customer) {
    const customer = customers.find((c) => c.id === invoice.customer);
    if (customer && customer.phone) {
      const docLabel = invoice.docType === "receipt" ? "Receipt" : "Invoice";
      const html = buildDocumentHTML(invoice);
      showAppToast(`📤 Sending ${docLabel} via WhatsApp…`, "#2563eb");
      fetch("/api/whatsapp/send-invoice-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: customer.phone,
          html,
          invoiceId: invoice.id,
          invoice,
          customerName: customer.name,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) {
            console.log(`✅ WA ${docLabel} sent:`, invoice.id);
            showAppToast(`✅ ${docLabel} sent via WhatsApp!`, "#16a34a");
          } else {
            console.warn("WA send failed:", d.error);
            showAppToast(
              `⚠️ WhatsApp send failed: ${d.error || "unknown"}`,
              "#dc2626",
            );
          }
        })
        .catch((e) => {
          console.warn("WA send error:", e.message);
          showAppToast(`⚠️ WhatsApp error: ${e.message}`, "#dc2626");
        });
    } else if (customer && !customer.phone) {
      console.log("ℹ️ Customer has no phone — WhatsApp skipped");
    }
  }

  cart = [];
  clearBillingCustomer();
  const noteEl = $("#billing-invoice-note");
  if (noteEl) noteEl.value = "";
  const dpEl = $("#discount-percent");
  const daEl = $("#discount-amount-input");
  const tpEl = $("#tax-percent");
  const pmEl = $("#payment-method");
  if (dpEl) dpEl.value = 0;
  if (daEl) daEl.value = 0;
  if (tpEl) tpEl.value = 0;
  if (pmEl) pmEl.value = "cash";
  // Reset credit pill back to cash
  document
    .querySelectorAll("input[name='payment-method-radio']")
    .forEach((r) => {
      r.checked = r.value === "cash";
    });
  const cpn = $("#credit-paid-now");
  if (cpn) cpn.value = 0;
  const apn = $("#advance-paid-now");
  if (apn) apn.value = 0;
  toggleCreditDetails("cash");

  updateSearchSuggestions();
  renderCart();
  showInvoiceModal(invoice);
}

let _currentModalInvoice = null;

function showInvoiceModal(invoice) {
  const modal = $("#invoice-modal");
  const content = $("#invoice-html");
  if (!modal || !content) return;
  _currentModalInvoice = invoice;
  content.innerHTML = buildDocumentHTML(invoice);
  modal.dataset.doctype = invoice.docType || "invoice";
  modal.classList.remove("hidden");
}

async function downloadInvoicePdf() {
  if (!_currentModalInvoice) return;
  const btn = $("#btn-download-invoice-pdf");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generating...";
  }
  try {
    const html = buildDocumentHTML(_currentModalInvoice);
    const docLabel =
      _currentModalInvoice.docType === "receipt" ? "Receipt"
      : _currentModalInvoice.docType === "return" ? "Return"
      : "Invoice";
    const filename = `${docLabel}-${_currentModalInvoice.id}.pdf`;
    const res = await fetch("/api/invoice-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename }),
    });
    if (!res.ok) {
      alert("❌ PDF generation failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("❌ Error: " + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "⬇️ Download PDF";
    }
  }
}

/* ── Live settings reader (always picks up latest saved values) ── */
function L(key, def) {
  const v = (window.APP_CONFIG || {})[key];
  return v === undefined || v === null || v === "" ? def : v;
}
/* receipt termal */
function buildReceiptHTML(inv) {
  const customer = customers.find((c) => c.id === inv.customer);
  const bizName = escapeHtml(L("businessName", "") || L("appName", ""));
  const bizAddr = L("businessAddress", "");
  const bizPhone = L("businessPhone", "");
  const bizEmail = L("businessEmail", "");
  const headerCol = L("receiptHeaderColor", "#1a3a5c");
  const showTax = L("receiptShowTax", true);
  const showDisc = L("receiptShowDiscount", true);
  const showLogo = L("invoiceShowLogo", true);
  const showQR = L("invoiceShowQR", true);
  const rcptFoot = L(
    "receiptFooter",
    L("invoiceFooter", "Thank you! Please come again."),
  );
  const rcptNote = L("receiptNote", "");
  const totalDisc = (inv.itemDiscountTotal || 0) + (inv.discountAmt || 0);
  const terms = L("termsAndConditions", []) || [];

  // ---- FIXED QR (QuickChart API) ----
  const verificationUrl = `${window.location.origin}/verify/${inv.id}`;
  const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(verificationUrl)}&size=180&margin=2`;

  // Items rows – all text in black
  const rows = inv.items
    .map((it) => {
      const unitDisc = (it.price * (it.discountPct || 0)) / 100;
      const discPrice = it.price - unitDisc;
      const lineTotal =
        it.lineTotal !== undefined ? it.lineTotal : discPrice * it.qty;
      return `
      <tr>
        <td style="padding:3px 4px 3px 0;font-size:11px;line-height:1.4;font-weight:700;color:#000000;">
          ${escapeHtml(it.name)}
          ${it.serialNo ? `<br/><span style="font-size:9px;color:#555;">S/N: ${escapeHtml(it.serialNo)}</span>` : ""}
          ${it.warrantyMonths ? `<br/><span style="font-size:9px;color:#16a34a;">Warranty: ${it.warrantyMonths}mo</span>` : ""}
        </td>
        <td style="padding:3px 2px;font-size:11px;text-align:center;white-space:nowrap;color:#000000;">${Number(it.qty).toFixed(0)}</td>
        <td style="padding:3px 0 3px 4px;font-size:11px;text-align:right;white-space:nowrap;color:#000000;">${fmtCurrency(lineTotal)}</td>
      </td>`;
    })
    .join("");

  const termsLines =
    terms.length > 0
      ? terms
          .map(
            (t) =>
              `<div style="font-size:9px;color:#444;line-height:1.5;">• ${escapeHtml(t)}</div>`,
          )
          .join("")
      : "";

  const dashes = `<div style="border-top:2px dashed #333;margin:5px 0;"></div>`;

  return `
    <style>
      @media print { @page { size: 80mm auto; margin: 0; } }
      * { margin: 0; padding: 0; box-sizing: border-box; }
    </style>
    <div style="font-family:'Courier New', Courier, monospace; background:#fff; color:#111; width:80mm; margin:0 auto; padding:0 0 6mm 0; box-sizing:border-box; font-size:11px;">

      <!-- Coloured header band (logo only, no business name) -->
      <div style="background:${headerCol}; padding:5mm 4mm 4mm 4mm; text-align:center;">
        ${
          showLogo
            ? `<img src="/assets/logo.jpeg?t=${Date.now()}" alt="logo"
               style="width:26mm; height:26mm; object-fit:contain; display:block; margin:0 auto 3mm; border-radius:4mm; background:#fff; padding:1.5mm;"
               onerror="this.style.display='none'" />`
            : ""
        }
      </div>

      <!-- Shop details (compact) -->
      <div style="background:#fff; text-align:center; padding:2mm 4px; border-bottom:1px solid #ddd;">
        <div style="font-weight:700; font-size:12px;">${bizName}</div>
        ${bizAddr ? `<div style="font-size:9px; color:#333;"># ${escapeHtml(bizAddr)}</div>` : ""}
        ${bizPhone ? `<div style="font-size:9px; color:#333;"># ${escapeHtml(bizPhone)}</div>` : ""}
        ${bizEmail ? `<div style="font-size:9px; color:#333;"># ${escapeHtml(bizEmail)}</div>` : ""}
      </div>

      <!-- Receipt type band -->
      <div style="text-align:center; font-size:11px; font-weight:900; letter-spacing:.18em; padding:2.5mm 0; color:${headerCol}; border-bottom:2px solid ${headerCol};">SALES RECEIPT</div>

      <!-- Body padding -->
      <div style="padding:3mm 4mm 0 4mm;">

        <!-- Meta information -->
        <div style="font-size:10px; line-height:1.7; color:#000000;">
          <div style="display:flex; justify-content:space-between;">
            <span>Receipt#</span><span style="font-weight:700;">${escapeHtml(inv.id)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Date</span><span>${formatDateTime(inv.date)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Payment</span><span>${(inv.paymentMethod || "cash").toUpperCase()}</span>
          </div>
          ${
            inv.paymentMethod === "credit"
              ? `
          <div style="display:flex; justify-content:space-between; color:#16a34a;">
            <span>Paid</span><span style="font-weight:700;">${fmtCurrency(inv.paidAmount || 0)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:#dc2626;">
            <span>Balance Due</span><span style="font-weight:700;">${fmtCurrency(inv.creditAmount || 0)}</span>
          </div>`
              : ""
          }
          ${
            inv.paymentMethod === "advance"
              ? `
          <div style="display:flex; justify-content:space-between; color:#16a34a;">
            <span>Advance Paid</span><span style="font-weight:700;">${fmtCurrency(inv.paidAmount || 0)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:#b45309;">
            <span>Balance on Delivery</span><span style="font-weight:700;">${fmtCurrency(inv.creditAmount || 0)}</span>
          </div>`
              : ""
          }
          ${
            customer
              ? `<div style="display:flex; justify-content:space-between; margin-top:2px;">
            <span>Customer</span><span style="font-weight:600;">${escapeHtml(customer.name)}</span>
          </div>`
              : ""
          }
        </div>

        ${dashes}

        <!-- Items table -->
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="color:#000000;">
              <th style="font-size:10px; text-align:left; padding:3px 4px 3px 0; border-bottom:2px solid #111; font-weight:900;">Item</th>
              <th style="font-size:10px; text-align:center; padding:3px 2px; border-bottom:2px solid #111; font-weight:900;">Qty</th>
              <th style="font-size:10px; text-align:right; padding:3px 0 3px 4px; border-bottom:2px solid #111; font-weight:900;">Amt</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        ${dashes}

        <!-- Totals -->
        <div style="font-size:11px; line-height:1.8; color:#000000;">
          <div style="display:flex; justify-content:space-between;">
            <span>Subtotal</span><span>${fmtCurrency(inv.subtotal)}</span>
          </div>
          ${
            showDisc && totalDisc > 0
              ? `<div style="display:flex; justify-content:space-between; color:#c00;">
            <span>Discount</span><span>- ${fmtCurrency(totalDisc)}</span>
          </div>`
              : ""
          }
          ${
            showTax && (inv.taxAmt || 0) > 0
              ? `<div style="display:flex; justify-content:space-between;">
            <span>Tax (${inv.taxPct}%)</span><span>${fmtCurrency(inv.taxAmt)}</span>
          </div>`
              : ""
          }
          <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:900; border-top:3px solid #111; padding-top:4px; margin-top:3px; color:${headerCol}; letter-spacing:.04em;">
            <span>TOTAL</span><span>${fmtCurrency(inv.total)}</span>
          </div>
        </div>

        ${inv.notes ? `${dashes}<div style="font-size:9px; color:#1e293b; line-height:1.5; padding:2px 0;"><strong>Notes :-</strong> ${escapeHtml(inv.notes)}</div>` : ""}
        ${rcptNote ? `${dashes}<div style="font-size:9px; color:#444; line-height:1.5; text-align:center; font-style:italic;">${escapeHtml(rcptNote)}</div>` : ""}
        ${termsLines ? `${dashes}<div>${termsLines}</div>` : ""}
        ${dashes}

        <!-- Footer with fixed QR -->
        <div style="text-align:center; margin-top:4px;">
          <div style="font-size:10px; font-weight:600; margin-bottom:4px; color:${headerCol};">${escapeHtml(rcptFoot)}</div>
          <div style="font-size:9px; color:#777; margin-bottom:4px;">${escapeHtml(inv.id)}</div>
          ${
            showQR
              ? `<img src="${qrImageUrl}" alt="QR"
               style="width:18mm; height:18mm; display:block; margin:0 auto 2px;" />
          <div style="font-size:8px; color:#888; text-transform:uppercase; letter-spacing:.04em;">Scan to verify</div>`
              : ""
          }
        </div>

      </div><!-- /body padding -->
    </div>`;
}
/* ── Return Receipt (80mm thermal — matches Sales Receipt style) ─── */
function buildReturnHTML(inv) {
  const customer  = customers.find((c) => c.id === inv.customer);
  const bizName   = escapeHtml(L("businessName", "") || L("appName", "Zyphra POS"));
  const bizAddr   = L("businessAddress", "");
  const bizPhone  = L("businessPhone", "");
  const bizEmail  = L("businessEmail", "");
  const headerCol = "#b45309";
  const showLogo  = L("invoiceShowLogo", true);
  const showQR    = L("invoiceShowQR", true);
  const rcptFoot  = L("receiptFooter", L("invoiceFooter", "Thank you! Please come again."));
  const refundAmt = Math.abs(inv.total || 0);
  const dashes    = `<div style="border-top:2px dashed #333;margin:5px 0;"></div>`;
  const verificationUrl = `${window.location.origin}/verify/${inv.id}`;
  const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(verificationUrl)}&size=180&margin=2`;

  const rows = (inv.items || []).map((it) => {
    const lineTotal = it.lineTotal !== undefined ? it.lineTotal : (it.price || 0) * (it.qty || 1);
    return `<tr>
      <td style="padding:3px 4px 3px 0;font-size:11px;line-height:1.4;font-weight:700;color:#000;">
        ${escapeHtml(it.name || "")}
        ${it.sku ? `<br/><span style="font-size:9px;color:#555;">SKU: ${escapeHtml(it.sku)}</span>` : ""}
        ${it.serialNo ? `<br/><span style="font-size:9px;color:#555;">S/N: ${escapeHtml(it.serialNo)}</span>` : ""}
      </td>
      <td style="padding:3px 2px;font-size:11px;text-align:center;color:#000;">${Number(it.qty).toFixed(0)}</td>
      <td style="padding:3px 0 3px 4px;font-size:11px;text-align:right;color:#c00;font-weight:700;">(${fmtCurrency(lineTotal)})</td>
    </tr>`;
  }).join("");

  return `
    <style>
      @media print { @page { size: 80mm auto; margin: 0; } }
      * { margin: 0; padding: 0; box-sizing: border-box; }
    </style>
    <div style="font-family:'Courier New',Courier,monospace;background:#fff;color:#111;width:80mm;margin:0 auto;padding:0 0 6mm 0;box-sizing:border-box;font-size:11px;">

      <div style="background:${headerCol};padding:5mm 4mm 4mm 4mm;text-align:center;">
        ${showLogo ? `<img src="/assets/logo.jpeg?t=${Date.now()}" alt="logo" style="width:26mm;height:26mm;object-fit:contain;display:block;margin:0 auto 3mm;border-radius:4mm;background:#fff;padding:1.5mm;" onerror="this.style.display='none'" />` : ""}
      </div>

      <div style="background:#fff;text-align:center;padding:2mm 4px;border-bottom:1px solid #ddd;">
        <div style="font-weight:700;font-size:12px;">${bizName}</div>
        ${bizAddr  ? `<div style="font-size:9px;color:#333;"># ${escapeHtml(bizAddr)}</div>`  : ""}
        ${bizPhone ? `<div style="font-size:9px;color:#333;"># ${escapeHtml(bizPhone)}</div>` : ""}
        ${bizEmail ? `<div style="font-size:9px;color:#333;"># ${escapeHtml(bizEmail)}</div>` : ""}
      </div>

      <div style="text-align:center;font-size:11px;font-weight:900;letter-spacing:.18em;padding:2.5mm 0;color:${headerCol};border-bottom:2px solid ${headerCol};">RETURN RECEIPT</div>

      <div style="padding:3mm 4mm 0 4mm;">
        <div style="font-size:10px;line-height:1.7;color:#000;">
          <div style="display:flex;justify-content:space-between;"><span>Return#</span><span style="font-weight:700;">${escapeHtml(inv.id)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>Ref Invoice</span><span>${escapeHtml(inv.refInvoiceId || "—")}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>Date</span><span>${formatDate(inv.date)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>Processed By</span><span>${escapeHtml(inv.soldBy || "—")}</span></div>
          ${customer ? `<div style="display:flex;justify-content:space-between;margin-top:2px;"><span>Customer</span><span style="font-weight:600;">${escapeHtml(customer.name)}</span></div>` : ""}
          ${customer && customer.phone ? `<div style="display:flex;justify-content:space-between;"><span>Phone</span><span>${escapeHtml(customer.phone)}</span></div>` : ""}
        </div>

        ${dashes}

        ${inv.reason ? `<div style="font-size:9px;color:#7c2d12;padding:2px 0 4px;line-height:1.5;"><strong>Reason:</strong> ${escapeHtml(inv.reason)}</div>${dashes}` : ""}

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="font-size:10px;text-align:left;padding:3px 4px 3px 0;border-bottom:2px solid #111;font-weight:900;color:#000;">Item</th>
              <th style="font-size:10px;text-align:center;padding:3px 2px;border-bottom:2px solid #111;font-weight:900;color:#000;">Qty</th>
              <th style="font-size:10px;text-align:right;padding:3px 0 3px 4px;border-bottom:2px solid #111;font-weight:900;color:#000;">Amt</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        ${dashes}

        <div style="font-size:11px;line-height:1.8;color:#000;">
          <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;border-top:3px solid #111;padding-top:4px;margin-top:3px;color:${headerCol};letter-spacing:.04em;">
            <span>REFUND</span><span>(${fmtCurrency(refundAmt)})</span>
          </div>
        </div>

        <div style="margin-top:4px;padding:2.5mm 3mm;background:#fff7ed;border-left:3px solid ${headerCol};font-size:9px;color:#7c2d12;line-height:1.5;">
          Refund of <strong>${fmtCurrency(refundAmt)}</strong> processed. Stock has been restored.
        </div>

        ${dashes}

        <div style="text-align:center;margin-top:4px;">
          <div style="font-size:10px;font-weight:600;margin-bottom:4px;color:${headerCol};">${escapeHtml(rcptFoot)}</div>
          <div style="font-size:9px;color:#777;margin-bottom:4px;">${escapeHtml(inv.id)}</div>
          ${showQR ? `<img src="${qrImageUrl}" alt="QR" style="width:18mm;height:18mm;display:block;margin:0 auto 2px;" /><div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.04em;">Scan to verify</div>` : ""}
        </div>
      </div>
    </div>`;
}
function _buildReturnHTML_old_UNUSED(inv) {
  const customer = customers.find((c) => c.id === inv.customer);
  const bizName  = "";
  const bizAddr  = "";
  const bizPhone = "";
  const bizEmail = "";
  const headerCol = "#b45309";
  const showLogo  = true;
  const showQR    = true;
  const invFoot   = "";
  const TH = "";
  const TD = "";

  const rows = (inv.items || []).map((it) => {
    const lineTotal = it.lineTotal !== undefined ? it.lineTotal : it.price * it.qty;
    return `
      <tr>
        <td style="${TD}">
          ${escapeHtml(it.name || "")}
          ${it.sku ? `<div style="font-size:9px;color:#999;margin-top:2px;">SKU: ${escapeHtml(it.sku)}</div>` : ""}
          ${it.serialNo ? `<div style="font-size:9px;color:#999;margin-top:2px;">S/N: ${escapeHtml(it.serialNo)}</div>` : ""}
        </td>
        <td style="${TD}text-align:center;">${Number(it.qty).toFixed(0)}</td>
        <td style="${TD}text-align:right;">${fmtCurrency(it.price || 0)}</td>
        <td style="${TD}text-align:right;font-weight:700;color:#dc2626;">(${fmtCurrency(lineTotal)})</td>
      </tr>`;
  }).join("");

  const refundAmt = Math.abs(inv.total || 0);

  return `
    <style>@media print { @page { size: A4 portrait; margin: 0; } }</style>
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#e8ecf0;color:#222;width:210mm;min-height:297mm;margin:0 auto;padding:0;box-sizing:border-box;">
      <div style="background:#fff;width:210mm;min-height:297mm;box-sizing:border-box;padding:14mm 14mm 0 14mm;display:flex;flex-direction:column;position:relative;overflow:hidden;">

        <!-- amber watermark -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80pt;font-weight:900;color:${headerCol};opacity:0.05;pointer-events:none;white-space:nowrap;letter-spacing:.05em;z-index:0;">RETURN</div>

        <!-- ══ HEADER ══ -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10mm;position:relative;z-index:1;">
          <div style="flex-shrink:0;">
            ${showLogo
              ? `<img src="/assets/logo.jpeg?t=${Date.now()}" alt="${bizName}" style="width:24mm;height:24mm;object-fit:contain;display:block;" />`
              : `<div style="font-size:18pt;font-weight:900;color:${headerCol};">${bizName}</div>`}
          </div>
          <div style="text-align:right;">
            <div style="font-size:26pt;font-weight:900;letter-spacing:.06em;color:${headerCol};">RETURN RECEIPT</div>
            <div style="font-size:9pt;color:#888;margin-top:1mm;">Ref: ${escapeHtml(inv.refInvoiceId || "—")}</div>
          </div>
        </div>

        <!-- ══ RETURN TO + META ══ -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm;position:relative;z-index:1;">
          <div>
            <div style="font-size:8.5pt;color:#666;margin-bottom:1.5mm;">Return from:</div>
            <div style="font-size:12pt;font-weight:700;color:#111;">${customer ? escapeHtml(customer.name) : "Walk-in Customer"}</div>
            ${customer && customer.phone ? `<div style="font-size:9pt;color:#555;margin-top:1mm;">${escapeHtml(customer.phone)}</div>` : ""}
          </div>
          <div style="text-align:right;font-size:9pt;line-height:1.9;">
            <span style="color:#666;">Return#</span>
            <span style="font-weight:700;margin-left:8mm;">${escapeHtml(inv.id)}</span><br/>
            <span style="color:#666;">Date</span>
            <span style="font-weight:600;margin-left:8mm;">${formatDate(inv.date)}</span><br/>
            <span style="color:#666;">Processed By</span>
            <span style="font-weight:600;margin-left:8mm;">${escapeHtml(inv.soldBy || "—")}</span>
          </div>
        </div>

        <!-- biz info -->
        <div style="font-size:8.5pt;color:#666;margin-bottom:6mm;line-height:1.6;position:relative;z-index:1;">
          <span style="font-weight:700;color:${headerCol};">${bizName}</span>
          ${bizAddr  ? ` &nbsp;|&nbsp; ${escapeHtml(bizAddr)}`  : ""}
          ${bizPhone ? ` &nbsp;|&nbsp; ${escapeHtml(bizPhone)}` : ""}
          ${bizEmail ? ` &nbsp;|&nbsp; ${escapeHtml(bizEmail)}` : ""}
        </div>

        <!-- ══ REASON ══ -->
        ${inv.reason ? `
        <div style="margin-bottom:5mm;padding:3mm 4mm;background:#fff7ed;border-left:3pt solid ${headerCol};font-size:9pt;color:#7c2d12;position:relative;z-index:1;">
          <strong>Return Reason:</strong> ${escapeHtml(inv.reason)}
        </div>` : ""}

        <!-- ══ ITEMS TABLE ══ -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:0;position:relative;z-index:1;">
          <thead>
            <tr>
              <th style="${TH}">Item Returned</th>
              <th style="${TH}text-align:center;">Qty</th>
              <th style="${TH}text-align:right;">Unit Price</th>
              <th style="${TH}text-align:right;">Refund Amt</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <!-- ══ TOTALS ══ -->
        <div style="display:flex;justify-content:flex-end;padding:4mm 0 5mm 0;position:relative;z-index:1;">
          <table style="font-size:10pt;min-width:55mm;border-collapse:collapse;">
            <tr>
              <td style="padding:3mm 6mm 1.5mm 0;font-size:12pt;font-weight:800;color:${headerCol};border-top:2px solid ${headerCol};">Total Refund</td>
              <td style="padding:3mm 0 1.5mm 0;font-size:12pt;font-weight:800;text-align:right;color:#dc2626;border-top:2px solid ${headerCol};">(${fmtCurrency(refundAmt)})</td>
            </tr>
          </table>
        </div>

        <!-- ══ REFUND METHOD NOTE ══ -->
        <div style="margin:0 0 4mm 0;padding:3mm 4mm;background:#f0fdf4;border-left:3pt solid #16a34a;font-size:9pt;color:#14532d;position:relative;z-index:1;">
          <strong>Refund Note:</strong> Refund of <strong>${fmtCurrency(refundAmt)}</strong> has been processed and stock has been restored.
          ${inv.paymentMethod === "credit" ? " Credit balance adjusted accordingly." : ""}
        </div>

        <!-- ══ FOOTER ══ -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4mm 0 8mm 0;margin-top:auto;position:relative;z-index:1;">
          <div>
            <div style="font-size:10pt;font-weight:600;color:${headerCol};">${escapeHtml(invFoot)}</div>
            <div style="width:50mm;border-bottom:1pt solid #aaa;margin-top:3mm;"></div>
            <div style="font-size:7.5pt;color:#aaa;margin-top:1.5mm;">${escapeHtml(inv.id)}</div>
          </div>
          ${showQR ? `
          <div style="text-align:center;">
            <img src="/api/qr/${escapeHtml(inv.id)}" alt="QR" style="width:18mm;height:18mm;display:block;margin:0 auto 1.5mm;" />
            <div style="font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${headerCol};">SCAN TO VERIFY</div>
          </div>` : ""}
        </div>

      </div>
    </div>`;
}
/* ── Invoice (A4) ────────────────────────────────────────────── */
function buildDocumentHTML(inv) {
  if (inv.docType === "receipt") return buildReceiptHTML(inv);
  if (inv.docType === "return") return buildReturnHTML(inv);

  const customer = customers.find((c) => c.id === inv.customer);
  const isQuotation = inv.docType === "quotation" || String(inv.id || "").startsWith("QUO-") || String(inv.id || "").startsWith("WA-");
  const docTitle = isQuotation ? "QUOTATION" : "INVOICE";
  const terms = L("termsAndConditions", []) || [];
  const totalDisc = (inv.itemDiscountTotal || 0) + (inv.discountAmt || 0);
  const bizName = escapeHtml(L("businessName", "SD COMPUTERS") || L("appName", "Zyphra POS"));
  const bizTagline = escapeHtml(L("appTagline", "") || "");
  const bizAddr = L("businessAddress", "");
  const bizPhone = L("businessPhone", "");
  const bizEmail = L("businessEmail", "");
  const headerCol = L("invoiceHeaderColor", "#1a3a5c");
  const watermark = L("invoiceWatermark", "");
  const showQR = L("invoiceShowQR", true);
  const showLogo = L("invoiceShowLogo", true);
  const showBizName = L("invoiceShowBizName", true);
  const invFoot = L("invoiceFooter", "Thank you for your business!");

  const verificationUrl = `${window.location.origin}/verify/${inv.id}`;
  const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(verificationUrl)}&size=200&margin=2`;

  const fontLink = `<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">`;

  const thStyle = `padding: 8px 8px; font-size: 11px; font-weight: 600; text-align: left; border-bottom: 2px solid ${headerCol}; color: ${headerCol}; background: #fafcff;`;
  const tdStyle = `padding: 6px 8px; font-size: 11px; border-bottom: 1px solid #e9ecef; vertical-align: top; line-height: 1.3; color: #000000;`;

  const rows = inv.items
    .map((it) => {
      const unitDisc = (it.price * (it.discountPct || 0)) / 100;
      const discPct = it.discountPct || 0;
      const discPrice = it.price - unitDisc;
      const lineTotal = it.lineTotal !== undefined ? it.lineTotal : discPrice * it.qty;
      const warrantyLabel = it.warrantyMonths
        ? `<div style="font-size: 8px; color: #16a34a; margin-top: 2px;">✔️ Warranty: ${it.warrantyMonths} month${it.warrantyMonths > 1 ? "s" : ""}</div>`
        : "";
      return `
        <tr>
          <td style="${tdStyle}">
            <div style="font-weight: 600;">${escapeHtml(it.name)}</div>
            ${it.sku ? `<div style="font-size: 8px; color: #6c757d; margin-top: 2px;">SKU: ${escapeHtml(it.sku)}</div>` : ""}
            ${it.serialNo ? `<div style="font-size: 8px; color: #6c757d; margin-top: 2px;">S/N: ${escapeHtml(it.serialNo)}</div>` : ""}
            ${warrantyLabel}
          </td>
          <td style="${tdStyle}text-align: center;">${Number(it.qty).toFixed(2)}</td>
          <td style="${tdStyle}text-align: right;">
            ${fmtCurrency(it.price)}
            ${discPct > 0 ? `<div style="font-size: 8px; color: #dc3545;">-${discPct}%</div>` : ""}
           </td>
          <td style="${tdStyle}text-align: right; font-weight: 700;">${fmtCurrency(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  const termsLines =
    terms.length > 0
      ? terms
          .map(
            (t) =>
              `<div style="font-size: 8px; color: #495057; margin-bottom: 4px; line-height: 1.4;">• ${escapeHtml(t)}</div>`
          )
          .join("")
      : `<div style="font-size: 8px; color: #adb5bd; font-style: italic;">No specific terms and conditions apply to this ${isQuotation ? "quotation" : "invoice"}.</div>`;

  const idLabel   = isQuotation ? "Quotation" : "Invoice";
  const dateLabel = isQuotation ? "Date" : "Date";

  return `
    <html>
    <head>
      ${fontLink}
      <style>
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
      </style>
    </head>
    <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f1f4f8; display: flex; justify-content: center; align-items: center; padding: 20px 0; margin: 0;">
      <div style="background: white; width: 210mm; min-height: 297mm; margin: 0 auto; box-shadow: 0 20px 35px -10px rgba(0,0,0,0.1); position: relative; overflow: visible;">

        ${watermark ? `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 70pt; font-weight: 900; color: ${headerCol}; opacity: 0.04; pointer-events: none; white-space: nowrap; letter-spacing: 0.05em; z-index: 0;">${escapeHtml(watermark)}</div>` : ""}

        <!-- Main column with minimal bottom padding -->
        <div style="padding: 12mm 14mm 4mm 14mm; position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 100%;">

          <!-- HEADER -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6mm;">
            <div>
              ${showLogo ? `<img src="/assets/logo.jpeg?t=${Date.now()}" alt="${bizName}" style="height: 28mm; width: auto; object-fit: contain;" onerror="this.style.display='none'" />` : ""}
            </div>
            <div style="font-size: 28pt; font-weight: 800; letter-spacing: 0.04em; color: ${headerCol};">${docTitle}</div>
          </div>

          <!-- Customer + Shop details -->
          <div style="display: flex; justify-content: space-between; margin-bottom: 6mm;">
            <div style="width: 48%;">
              <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #6c757d; margin-bottom: 2mm;">${isQuotation ? "Prepared For" : "Bill To"}</div>
              <div style="font-size: 12pt; font-weight: 700; color: #000000;">${customer ? escapeHtml(customer.name) : (inv.customerName ? escapeHtml(inv.customerName) : "Walk-in Customer")}</div>
              ${(customer?.phone || inv.customerPhone) ? `<div style="font-size: 9pt; color: #000000; margin-top: 2mm;"># ${escapeHtml(customer?.phone || inv.customerPhone)}</div>` : ""}
              ${(customer?.email || inv.customerEmail) ? `<div style="font-size: 9pt; color: #000000;"># ${escapeHtml(customer?.email || inv.customerEmail)}</div>` : ""}
              ${isQuotation && inv.validUntil ? `<div style="font-size: 8pt; color: #b45309; margin-top: 2mm; font-weight: 600;">⏳ Valid Until: ${formatDate(inv.validUntil)}</div>` : ""}
            </div>
            <div style="width: 48%; text-align: right;">
              ${showBizName ? `<div style="font-size: 11pt; font-weight: 700; color: ${headerCol};">${bizName}</div>` : ""}
              ${bizTagline ? `<div style="font-size: 8pt; color: #6c757d; margin-top: 1mm;">${bizTagline}</div>` : ""}
              ${bizAddr ? `<div style="font-size: 8pt; color: #000000; margin-top: 1mm;"># ${escapeHtml(bizAddr)}</div>` : ""}
              ${bizPhone ? `<div style="font-size: 8pt; color: #000000;"># ${escapeHtml(bizPhone)}</div>` : ""}
              ${bizEmail ? `<div style="font-size: 8pt; color: #000000;"># ${escapeHtml(bizEmail)}</div>` : ""}
            </div>
          </div>

          <!-- Items table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 4mm;">
            <thead>
              <tr><th style="${thStyle}">Item</th><th style="${thStyle}text-align: center;">Qty</th><th style="${thStyle}text-align: right;">Unit Price</th><th style="${thStyle}text-align: right;">Total</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <!-- Totals -->
          <div style="display: flex; justify-content: flex-end; margin-bottom: 4mm;">
            <div style="width: 70mm;">
              <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                <tr><td style="padding: 2mm 3mm 1mm 0; color: #000000;">Subtotal</td><td style="padding: 2mm 0; text-align: right; font-weight: 500; color: #000000;">${fmtCurrency(inv.subtotal)}</td></tr>
                ${totalDisc > 0 ? `<tr><td style="padding: 1mm 3mm 1mm 0; color: #dc3545;">Discount</td><td style="padding: 1mm 0; text-align: right; color: #dc3545;">- ${fmtCurrency(totalDisc)}</td></tr>` : ""}
                <tr><td style="padding: 1mm 3mm 1mm 0; color: #000000;">Tax (${inv.taxPct || 0}%)</td><td style="padding: 1mm 0; text-align: right; color: #000000;">${fmtCurrency(inv.taxAmt || 0)}</td></tr>
                <tr><td style="padding: 2mm 3mm 2mm 0; font-size: 12pt; font-weight: 800; color: ${headerCol}; border-top: 2px solid ${headerCol};">Total</td><td style="padding: 2mm 0 2mm 0; font-size: 12pt; font-weight: 800; text-align: right; color: #000000; border-top: 2px solid ${headerCol};">${fmtCurrency(inv.total)}</td></tr>
                ${inv.paymentMethod === "credit" ? `<tr><td style="padding: 1mm 3mm 1mm 0; color: #16a34a;">Paid</td><td style="padding: 1mm 0; text-align: right; color: #16a34a;">${fmtCurrency(inv.paidAmount || 0)}</td></tr><tr><td style="padding: 1mm 3mm 2mm 0; font-weight: 700; color: #dc2626;">Balance Due</td><td style="padding: 1mm 0 2mm 0; text-align: right; font-weight: 800; color: #dc2626;">${fmtCurrency(inv.creditAmount || 0)}</td></tr>` : ""}
                ${inv.paymentMethod === "advance" ? `<tr><td style="padding: 1mm 3mm 1mm 0; color: #16a34a;">Advance Paid</td><td style="padding: 1mm 0; text-align: right; color: #16a34a;">${fmtCurrency(inv.paidAmount || 0)}</td></tr><tr><td style="padding: 1mm 3mm 2mm 0; font-weight: 700; color: #b45309;">Balance on Delivery</td><td style="padding: 1mm 0 2mm 0; text-align: right; font-weight: 800; color: #b45309;">${fmtCurrency(inv.creditAmount || 0)}</td></tr>` : ""}
              </table>
            </div>
          </div>

          ${inv.paymentMethod === "credit" && inv.creditAmount > 0 ? `<div style="margin: 0 0 4mm 0; padding: 2mm 3mm; background: #fff7ed; border-left: 3px solid #f59e0b; font-size: 8pt; color: #7c2d12; border-radius: 4px;"><strong>⚠ Credit Invoice</strong><br>Outstanding balance: <strong>${fmtCurrency(inv.creditAmount)}</strong>. ${inv.paidAmount > 0 ? `Paid so far: ${fmtCurrency(inv.paidAmount)}.` : ""} ${L("paymentLink", "") ? `<div style="margin-top: 2mm;"><strong>💳 Pay Online:</strong> <a href="${L("paymentLink","")}" style="color: #b45309;">${L("paymentLink","")}</a></div>` : ""}</div>` : ""}
          ${inv.paymentMethod === "advance" && inv.creditAmount > 0 ? `<div style="margin: 0 0 4mm 0; padding: 2mm 3mm; background: #fefce8; border-left: 3px solid #ca8a04; font-size: 8pt; color: #713f12; border-radius: 4px;"><strong>⏳ Advance Invoice</strong><br>Advance paid: <strong>${fmtCurrency(inv.paidAmount)}</strong>. Balance on delivery: <strong>${fmtCurrency(inv.creditAmount)}</strong>.</div>` : ""}
          <!-- SPACER – pushes the bottom block further down -->
          <div style="flex-grow: 0.15; min-height: 8mm;"></div>

          <!-- === BOTTOM BLOCK (Notes + Terms + QR + Invoice details + Thank you + Signature) === -->
          <div style="margin-top: auto; padding-top: 0;">

            <!-- Terms & Conditions + Notes side by side -->
            <div style="display: flex; gap: 6mm; margin-bottom: 6mm; align-items: flex-start;">
              <div style="flex: ${inv.notes ? "1.4" : "1"};">
                <div style="font-size: 8pt; font-weight: 700; color: #1f2937; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2mm;">Terms & Conditions</div>
                ${termsLines}
              </div>
              ${inv.notes ? `
              <div style="flex: 1; min-width: 52mm;">
                <div style="font-size: 8pt; font-weight: 700; color: #1f2937; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2mm;">Notes</div>
                <div style="font-size: 8pt; color: #1e293b; line-height: 1.6; background: #f0f4ff; border-left: 3px solid #1e3a8a; padding: 2mm 3mm; border-radius: 4px;">Notes :- ${escapeHtml(inv.notes)}</div>
              </div>` : ""}
            </div>

            <!-- Divider -->
            <div style="border-top: 1px solid #e2e8f0; margin-bottom: 6mm;"></div>

            <!-- QR, Invoice Details, Thank You, Signature row -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <!-- LEFT: QR + document details -->
              <div style="display: flex; align-items: center; gap: 8mm;">
                ${showQR ? `
                <div style="text-align: center;">
                  <img src="${qrImageUrl}" alt="QR Code" style="width: 26mm; height: 26mm; display: block; margin-bottom: 2mm;" />
                  <div style="font-size: 7pt; font-weight: 600; color: ${headerCol}; letter-spacing: 0.05em;">SCAN TO VERIFY</div>
                </div>
                <div style="font-size: 9pt; line-height: 1.6; color: #000000;">
                  <div><span style="color: #6c757d;">${idLabel} - </span> <strong>${escapeHtml(inv.id)}</strong></div>
                  <div><span style="color: #6c757d;">${dateLabel} - </span> ${formatDate(inv.date)}</div>
                  ${!isQuotation ? `<div><span style="color: #6c757d;">Payment - </span> ${(inv.paymentMethod || "cash").toUpperCase()}</div>` : ""}
                  <div><span style="color: #6c757d;">${isQuotation ? "Prepared By" : "Sold By"} - </span> ${escapeHtml(inv.soldBy || "—")}</div>
                </div>
                ` : ""}
              </div>
              <!-- RIGHT: Thank you + Signature -->
              <div style="text-align: right;">
                <div style="font-size: 11pt; font-weight: 600; color: ${headerCol};">${escapeHtml(invFoot)}</div>
                <div style="margin-top: 9mm;">
                  <div style="width: 55mm; border-bottom: 1.5px solid #cbd5e1; margin-left: auto;"></div>
                  <div style="font-size: 8pt; color: #94a3b8; margin-top: 2mm;">Authorized Signature</div>
                </div>
              </div>
            </div>

          </div> <!-- end bottom block -->

        </div>
      </div>
    </body>
    </html>
  `;
}
// ==================== EXPENSES MANAGEMENT ====================
function renderExpensesTable() {
  const tbody = $("#expenses-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const catIconMap = {
    Rent: { icon: "fa-building", cls: "cat-rent" },
    Utilities: { icon: "fa-bolt", cls: "cat-utilities" },
    Salaries: { icon: "fa-briefcase", cls: "cat-salaries" },
    Supplies: { icon: "fa-box", cls: "cat-supplies" },
    Marketing: { icon: "fa-bullhorn", cls: "cat-marketing" },
    Maintenance: { icon: "fa-wrench", cls: "cat-maintenance" },
    Other: { icon: "fa-tag", cls: "cat-other" },
  };

  const searchTerm = $("#expense-search")?.value.toLowerCase() || "";
  const category = $("#expense-category-filter")?.value || "all";
  const filtered = expenses.filter((e) => {
    const matchSearch =
      !searchTerm ||
      e.name.toLowerCase().includes(searchTerm) ||
      e.description?.toLowerCase().includes(searchTerm);
    const matchCategory = category === "all" || e.category === category;
    return matchSearch && matchCategory;
  });

  // Update expense stats row
  const statsEl = $("#expense-stats");
  if (statsEl) {
    const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const thisMonth = expenses.filter((e) => {
      const d = new Date(e.date); const n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    }).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const topCat = Object.entries(
      expenses.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + (Number(e.amount) || 0); return acc; }, {})
    ).sort((a, b) => b[1] - a[1])[0];
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-card-icon" style="background:#fee2e2;color:#dc2626;"><i class="fa fa-receipt"></i></div>
        <div><div class="stat-label">Total Expenses</div><div class="stat-value">${fmtCurrency(total)}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#fef3c7;color:#d97706;"><i class="fa fa-calendar"></i></div>
        <div><div class="stat-label">This Month</div><div class="stat-value">${fmtCurrency(thisMonth)}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#dbeafe;color:#2563eb;"><i class="fa fa-list-alt"></i></div>
        <div><div class="stat-label">Total Records</div><div class="stat-value">${expenses.length}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#fce7f3;color:#db2777;"><i class="fa fa-chart-pie"></i></div>
        <div><div class="stat-label">Top Category</div><div class="stat-value" style="font-size:1rem;">${topCat ? topCat[0] : "—"}</div></div></div>
    `;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);"><i class="fa fa-receipt" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.4;"></i>No expenses found</td></tr>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach((e) => {
    const cat = catIconMap[e.category] || catIconMap.Other;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="hide-mobile" style="color:var(--muted);font-size:13px;">${formatDate(e.date)}</td>
      <td><span style="font-weight:600;color:#eef2ff;">${escapeHtml(e.name)}</span></td>
      <td class="hide-mobile"><span class="cat-badge ${cat.cls}"><i class="fa ${cat.icon}"></i> ${e.category}</span></td>
      <td class="amt-red">${fmtCurrency(e.amount)}</td>
      <td class="hide-sm" style="color:var(--muted);font-size:13px;">${e.description || "—"}</td>
      <td><div class="action-btns">
        <button class="sec-action-btn ab-del delete-expense" data-id="${e.id}"><i class="fa fa-trash"></i> <span>Delete</span></button>
      </div></td>
    `;
    tbody.appendChild(tr);
  });

  qsa(".delete-expense").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (confirm("Delete this expense?")) {
        expenses = expenses.filter((x) => x.id !== e.target.dataset.id);
        saveAllData();
        renderExpensesTable();
        updateDashboard();
      }
    });
  });
}

// ==================== SUPPLIERS SYSTEM ====================

function renderSuppliersList() {
  const tbody = $("#suppliers-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const search = ($("#supplier-search")?.value || "").toLowerCase();
  const filtered = suppliers.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search) ||
      (s.phone && s.phone.toLowerCase().includes(search)) ||
      (s.email && s.email.toLowerCase().includes(search)) ||
      (s.contact && s.contact.toLowerCase().includes(search)),
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--muted);">
      <i class="fa fa-building" style="font-size:28px;display:block;margin-bottom:10px;opacity:0.35;"></i>
      ${search ? "No suppliers match your search" : "No suppliers yet — click <b>New Supplier</b> to add one"}
    </td></tr>`;
    return;
  }

  const avatarColors = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#06b6d4","#3b82f6","#ef4444","#14b8a6","#f97316"];
  const pickColor = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return avatarColors[h % avatarColors.length];
  };

  filtered.forEach((s) => {
    const supplierPurchases = purchases.filter((p) => p.supplierId === s.id || p.supplier === s.name);
    const totalSpent = supplierPurchases.reduce((sum, p) => sum + p.totalCost, 0);
    const initial = (s.name || "?").trim().charAt(0).toUpperCase();
    const color = pickColor(s.name || "?");

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.innerHTML = `
      <td>
        <div class="cust-name-cell">
          <div class="cust-avatar" style="background:${color};">${escapeHtml(initial)}</div>
          <div class="cust-name-wrap">
            <div class="cust-name">${escapeHtml(s.name)}</div>
            <div class="cust-sub">${s.contact ? escapeHtml(s.contact) + " · " : ""}${supplierPurchases.length} purchase${supplierPurchases.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
      </td>
      <td class="hide-sm" style="color:var(--muted);font-size:13px;">${s.phone ? escapeHtml(s.phone) : '<span style="color:var(--muted);opacity:0.5;">—</span>'}</td>
      <td class="hide-sm"><span class="cust-total">${fmtCurrency(totalSpent)}</span></td>
      <td>
        <div class="action-btns" style="justify-content:flex-end;">
          <button class="cust-btn cust-btn-info sup-info-btn" data-id="${s.id}" title="View supplier info"><i class="fas fa-circle-info"></i><span>Info</span></button>
          <button class="cust-btn cust-btn-edit sup-edit-btn" data-id="${s.id}" title="Edit"><i class="fas fa-pen"></i><span>Edit</span></button>
          <button class="cust-btn cust-btn-delete sup-delete-btn" data-id="${s.id}" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    tr.querySelector(".cust-name-cell").addEventListener("click", () => openSupplierInfoModal(s.id));
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".sup-info-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openSupplierInfoModal(btn.dataset.id); });
  });
  tbody.querySelectorAll(".sup-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openSupplierModal(btn.dataset.id); });
  });
  tbody.querySelectorAll(".sup-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sup = suppliers.find((x) => x.id === btn.dataset.id);
      if (!sup) return;
      const hasPurchases = purchases.some((p) => p.supplierId === sup.id);
      const msg = hasPurchases
        ? `"${sup.name}" has purchase history. Delete supplier record anyway?\n(Purchase records will be kept)`
        : `Delete supplier "${sup.name}"?`;
      if (confirm(msg)) {
        suppliers = suppliers.filter((x) => x.id !== btn.dataset.id);
        saveSome("suppliers");
        renderSuppliersList();
        populatePurchaseSupplierDropdown();
      }
    });
  });
}

function openSupplierModal(editId = null) {
  const modal = $("#supplier-modal");
  const title = $("#supplier-modal-title");
  if (!modal) return;

  const fields = ["sup-name","sup-contact","sup-phone","sup-email","sup-website","sup-address","sup-bank-name","sup-bank-acc","sup-notes","sup-editing-id"];
  fields.forEach((id) => { const el = $(`#${id}`); if (el) el.value = ""; });

  if (editId) {
    const s = suppliers.find((x) => x.id === editId);
    if (!s) return;
    if (title) title.innerHTML = '<i class="fa fa-building" style="color:var(--primary);"></i> Edit Supplier';
    if ($("#sup-name")) $("#sup-name").value = s.name || "";
    if ($("#sup-contact")) $("#sup-contact").value = s.contact || "";
    if ($("#sup-phone")) $("#sup-phone").value = s.phone || "";
    if ($("#sup-email")) $("#sup-email").value = s.email || "";
    if ($("#sup-website")) $("#sup-website").value = s.website || "";
    if ($("#sup-address")) $("#sup-address").value = s.address || "";
    if ($("#sup-bank-name")) $("#sup-bank-name").value = s.bankName || "";
    if ($("#sup-bank-acc")) $("#sup-bank-acc").value = s.bankAcc || "";
    if ($("#sup-notes")) $("#sup-notes").value = s.notes || "";
    if ($("#sup-editing-id")) $("#sup-editing-id").value = editId;
  } else {
    if (title) title.innerHTML = '<i class="fa fa-building" style="color:var(--primary);"></i> Add Supplier';
  }
  modal.classList.remove("hidden");
  setTimeout(() => $("#sup-name")?.focus(), 100);
}

function closeSupplierModal() {
  $("#supplier-modal")?.classList.add("hidden");
}

function saveSupplier() {
  const name = $("#sup-name")?.value.trim();
  if (!name) { alert("Supplier name is required"); $("#sup-name")?.focus(); return; }

  const editId = $("#sup-editing-id")?.value || "";
  const now = new Date().toISOString();

  if (editId) {
    const idx = suppliers.findIndex((x) => x.id === editId);
    if (idx !== -1) {
      suppliers[idx] = {
        ...suppliers[idx],
        name,
        contact: $("#sup-contact")?.value.trim() || "",
        phone: $("#sup-phone")?.value.trim() || "",
        email: $("#sup-email")?.value.trim() || "",
        website: $("#sup-website")?.value.trim() || "",
        address: $("#sup-address")?.value.trim() || "",
        bankName: $("#sup-bank-name")?.value.trim() || "",
        bankAcc: $("#sup-bank-acc")?.value.trim() || "",
        notes: $("#sup-notes")?.value.trim() || "",
        updatedAt: now,
      };
    }
  } else {
    suppliers.push({
      id: genId(),
      name,
      contact: $("#sup-contact")?.value.trim() || "",
      phone: $("#sup-phone")?.value.trim() || "",
      email: $("#sup-email")?.value.trim() || "",
      website: $("#sup-website")?.value.trim() || "",
      address: $("#sup-address")?.value.trim() || "",
      bankName: $("#sup-bank-name")?.value.trim() || "",
      bankAcc: $("#sup-bank-acc")?.value.trim() || "",
      notes: $("#sup-notes")?.value.trim() || "",
      createdAt: now,
    });
  }

  saveSome("suppliers");
  renderSuppliersList();
  populatePurchaseSupplierDropdown();
  closeSupplierModal();
  showAppToast(`✅ Supplier "${name}" saved`);
}

function openSupplierInfoModal(supplierId) {
  const modal = $("#supplier-info-modal");
  const content = $("#supplier-info-content");
  if (!modal || !content) return;

  const s = suppliers.find((x) => x.id === supplierId);
  if (!s) return;

  const supplierPurchases = purchases
    .filter((p) => p.supplierId === s.id || p.supplier === s.name)
    .slice()
    .reverse();
  const totalSpent = supplierPurchases.reduce((sum, p) => sum + p.totalCost, 0);

  const avatarColors = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#06b6d4","#3b82f6","#ef4444","#14b8a6","#f97316"];
  const pickColor = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return avatarColors[h % avatarColors.length];
  };
  const color = pickColor(s.name || "?");
  const initial = (s.name || "?").trim().charAt(0).toUpperCase();

  const payBadgeMap = {
    cash:   { cls: "pay-cash",   label: "Cash" },
    bank:   { cls: "pay-bank",   label: "Bank" },
    card:   { cls: "pay-card",   label: "Card" },
    credit: { cls: "pay-credit", label: "Credit" },
  };

  const purchaseRows = supplierPurchases.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted);"><i class="fa fa-box-open" style="font-size:20px;display:block;margin-bottom:6px;opacity:0.4;"></i>No purchases yet</td></tr>`
    : supplierPurchases.map((p) => {
        const pay = payBadgeMap[p.payment] || { cls: "pay-cash", label: p.payment };
        return `<tr>
          <td><span class="code-chip" style="cursor:pointer;" data-po-id="${p.id}">${p.id}</span></td>
          <td style="color:var(--muted);font-size:12px;">${formatDate(p.date)}</td>
          <td style="color:var(--muted);font-size:12px;">${p.items.reduce((s, i) => s + i.qty, 0)} item(s)</td>
          <td class="amt-blue">${fmtCurrency(p.totalCost)}</td>
          <td><span class="pay-badge ${pay.cls}">${pay.label}</span></td>
        </tr>`;
      }).join("");

  const detailRow = (icon, label, val) =>
    val ? `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);">
      <i class="fa ${icon}" style="color:var(--primary);width:18px;margin-top:2px;flex-shrink:0;"></i>
      <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">${label}</div>
      <div style="font-size:14px;color:var(--text);margin-top:2px;">${escapeHtml(val)}</div></div>
    </div>` : "";

  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
      <div style="width:56px;height:56px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;flex-shrink:0;">${escapeHtml(initial)}</div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:var(--text);">${escapeHtml(s.name)}</div>
        ${s.contact ? `<div style="color:var(--muted);font-size:13px;margin-top:2px;"><i class="fa fa-user" style="margin-right:4px;"></i>${escapeHtml(s.contact)}</div>` : ""}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="small" onclick="openSupplierModal('${s.id}');closeSupplierInfoModal();" title="Edit"><i class="fa fa-pen"></i></button>
      </div>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:var(--primary);">${supplierPurchases.length}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">Total Purchases</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:18px;font-weight:800;color:#10b981;">${fmtCurrency(totalSpent)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">Total Spent</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:20px;">
      ${detailRow("fa-phone","Phone",s.phone)}
      ${detailRow("fa-envelope","Email",s.email)}
      ${detailRow("fa-globe","Website",s.website)}
      ${detailRow("fa-location-dot","Address",s.address)}
      ${detailRow("fa-building-columns","Bank",s.bankName ? s.bankName + (s.bankAcc ? " — " + s.bankAcc : "") : "")}
      ${s.notes ? `<div style="grid-column:1/-1;${detailRow("fa-note-sticky","Notes",s.notes).includes("display") ? "" : ""}">
        ${detailRow("fa-note-sticky","Notes",s.notes)}
      </div>` : ""}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h4 style="margin:0;display:flex;align-items:center;gap:8px;"><i class="fa fa-history" style="color:var(--primary);"></i> Purchase History</h4>
      <button class="primary" id="sup-info-new-purchase-btn" data-supplier-id="${s.id}" style="font-size:13px;padding:6px 14px;">
        <i class="fa fa-plus"></i> New Purchase
      </button>
    </div>
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Purchase ID</th>
            <th>Date</th>
            <th>Items</th>
            <th>Total Cost</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody id="sup-purchase-history-tbody">${purchaseRows}</tbody>
      </table>
    </div>
  `;

  modal.classList.remove("hidden");

  content.querySelectorAll("[data-po-id]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const p = purchases.find((x) => x.id === chip.dataset.poId);
      if (p) { closeSupplierInfoModal(); showPurchaseDetailModal(p); }
    });
  });

  const newPurchaseBtn = $("#sup-info-new-purchase-btn");
  if (newPurchaseBtn) {
    newPurchaseBtn.addEventListener("click", () => {
      closeSupplierInfoModal();
      showPurchaseForm(supplierId);
    });
  }
}

function closeSupplierInfoModal() {
  $("#supplier-info-modal")?.classList.add("hidden");
}

function populatePurchaseSupplierDropdown(selectedId = "") {
  const sel = $("#purchase-supplier-id");
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Supplier --</option>' +
    suppliers.map((s) => `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
}

// ==================== RETURNS & REFUNDS SYSTEM ====================
let returns = [];
let _returnType = "customer"; // "customer" | "supplier"
let _retItemsData = []; // stores current items for the new-ret-modal reliably

function renderReturnsView() {
  // Update stats
  const custRets = returns.filter((r) => r.type === "customer");
  const suppRets = returns.filter((r) => r.type === "supplier");
  const totalVal = returns.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const setTxt = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  setTxt("#ret-stat-total", returns.length);
  setTxt("#ret-stat-customer", custRets.length);
  setTxt("#ret-stat-supplier", suppRets.length);
  setTxt("#ret-stat-value", fmtCurrency(totalVal));

  // Filter tab
  const activeTab = (document.querySelector(".tab-filter-btn.active[data-ret-tab]") || {}).dataset?.retTab || "all";
  const search = ($("#returns-search")?.value || "").toLowerCase();

  let filtered = returns.filter((r) => {
    if (activeTab !== "all" && r.type !== activeTab) return false;
    if (search) {
      const hay = `${r.id} ${r.customerName || ""} ${r.supplierName || ""} ${r.reason || ""} ${r.referenceId || ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Sort newest first
  filtered = filtered.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody = $("#returns-tbody");
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--muted);">No returns found</td></tr>`;
    return;
  }

  const typeColors = { customer: "#8b5cf6", supplier: "#0ea5e9" };
  const typeIcons  = { customer: "fa-user-times", supplier: "fa-truck" };

  tbody.innerHTML = filtered.map((r) => {
    const dateStr = r.date ? new Date(r.date).toLocaleDateString() : "—";
    const party   = r.type === "customer" ? (r.customerName || "—") : (r.supplierName || "—");
    const itemCount = (r.items || []).reduce((s, i) => s + (i.qty || 0), 0);
    const color   = typeColors[r.type] || "#6b7280";
    const icon    = typeIcons[r.type] || "fa-undo";
    return `<tr>
      <td><span style="font-family:monospace;font-weight:700;">${escapeHtml(r.id)}</span></td>
      <td class="hide-mobile">${dateStr}</td>
      <td><span style="background:${color}22;color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">
        <i class="fa ${icon}"></i> ${r.type.charAt(0).toUpperCase() + r.type.slice(1)}
      </span></td>
      <td><span style="font-family:monospace;font-size:12px;">${escapeHtml(r.referenceId || "—")}</span></td>
      <td>${escapeHtml(party)}</td>
      <td class="hide-sm">${itemCount} item${itemCount !== 1 ? "s" : ""}</td>
      <td style="font-weight:700;">${fmtCurrency(r.totalAmount || 0)}</td>
      <td style="font-size:12px;color:var(--muted);">${escapeHtml(r.reason || "—")}</td>
      <td style="display:flex;gap:5px;align-items:center;">
        <button class="small" onclick="previewReturnReceipt('${r.id}')" title="Preview Receipt" style="background:rgba(245,158,11,0.12);color:#f59e0b;border:1px solid rgba(245,158,11,0.25);"><i class="fa fa-eye"></i></button>
        ${r.type === "customer" ? `<button class="small" onclick="resendReturnWhatsApp('${r.id}',this)" title="Resend WhatsApp" style="background:rgba(37,211,102,0.1);color:#25d366;border:1px solid rgba(37,211,102,0.25);"><i class="fab fa-whatsapp"></i></button>` : ""}
        <button class="small danger" onclick="deleteReturn('${r.id}')" title="Delete"><i class="fa fa-trash"></i></button>
      </td>
    </tr>`;
  }).join("");
}

function deleteReturn(id) {
  const ret = returns.find((r) => r.id === id);
  if (!ret) return;
  if (!confirm(`Delete return ${id}? This will NOT reverse the inventory adjustment.`)) return;
  returns = returns.filter((r) => r.id !== id);
  saveSome("returns");
  renderReturnsView();
}

function previewReturnReceipt(id) {
  const ret = returns.find((r) => r.id === id);
  if (!ret) { showAppToast("Return record not found", "#ef4444"); return; }

  // Build an invoice-compatible object for buildReturnHTML
  const inv = {
    id: ret.id,
    docType: "return",
    refInvoiceId: ret.referenceId || "—",
    date: ret.date,
    customer: ret.customerId || null,
    items: (ret.items || []).map((i) => ({
      id: i.productId || "",
      name: i.name || "",
      sku: i.sku || "",
      qty: i.qty || 1,
      price: i.unitPrice || 0,
      lineTotal: i.total || 0,
    })),
    subtotal: ret.totalAmount || 0,
    total: -(ret.totalAmount || 0),
    reason: ret.reason || "",
    paymentMethod: ret.paymentMethod || "cash",
    soldBy: ret.processedBy || ret.soldBy || "—",
  };

  const html = buildReturnHTML(inv);
  _rtnPreviewHTML = html;
  const modal = $("#rtn-preview-modal");
  const frame = $("#rtn-preview-frame");
  if (!modal || !frame) return;

  frame.srcdoc = html;
  modal.classList.remove("hidden");

  // Wire download button
  const dlBtn = $("#rtn-preview-download");
  if (dlBtn) {
    dlBtn.onclick = async () => {
      dlBtn.disabled = true;
      dlBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Generating…';
      try {
        const res = await fetch("/api/invoice-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html, filename: `Return-${ret.id}.pdf` }),
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `Return-${ret.id}.pdf`; a.click();
        URL.revokeObjectURL(url);
        showAppToast(`📄 Return-${ret.id}.pdf downloaded`, "#10b981");
      } catch {
        showAppToast("PDF generation failed", "#ef4444");
      } finally {
        dlBtn.disabled = false;
        dlBtn.innerHTML = '<i class="fa fa-download"></i> Download PDF';
      }
    };
  }
}

async function resendReturnWhatsApp(id, btn) {
  const ret = returns.find((r) => r.id === id);
  if (!ret) return;
  const cust = customers.find((c) => c.id === ret.customerId);
  if (!cust) { showAppToast("No linked customer found", "#ef4444"); return; }
  if (!cust.phone) { showAppToast(`Customer "${cust.name}" has no phone number`, "#f59e0b"); return; }
  if (!confirm(`Send return receipt ${id} to ${cust.name} (${cust.phone}) via WhatsApp?`)) return;

  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';

  const inv = {
    id: ret.id, docType: "return", refInvoiceId: ret.referenceId || "—",
    date: ret.date, customer: ret.customerId || null,
    items: (ret.items || []).map((i) => ({ name: i.name || "", sku: i.sku || "", qty: i.qty || 1, price: i.unitPrice || 0, lineTotal: i.total || 0 })),
    subtotal: ret.totalAmount || 0, total: -(ret.totalAmount || 0),
    reason: ret.reason || "", paymentMethod: ret.paymentMethod || "cash",
    soldBy: ret.processedBy || "—",
  };

  try {
    const html = buildReturnHTML(inv);
    const res  = await fetch("/api/whatsapp/send-invoice-html", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: cust.phone, html, invoiceId: id, invoice: inv, customerName: cust.name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) showAppToast(`✅ Return receipt resent to ${cust.name}`, "#10b981");
    else showAppToast(`⚠️ Send failed: ${data.error || res.statusText}`, "#dc2626");
  } catch (e) {
    showAppToast(`⚠️ Error: ${e.message}`, "#dc2626");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function openNewReturnModal(type = "supplier", presetPoId = "") {
  _returnType = "supplier";
  // Reset form
  const fields = ["ret-invoice-search", "ret-invoice-id", "ret-po-search", "ret-po-id", "ret-notes"];
  fields.forEach((f) => { const el = $(`#${f}`); if (el) el.value = ""; });
  const reasonEl = $("#ret-reason"); if (reasonEl) reasonEl.value = "";
  $("#ret-items-section")?.classList.add("hidden");
  $("#ret-details-step")?.classList.add("hidden");
  $("#ret-summary")?.classList.add("hidden");
  $("#ret-po-info-bar")?.classList.add("hidden");
  const itemsList = $("#ret-items-list");
  if (itemsList) itemsList.innerHTML = "";
  _retItemsData = [];
  $("#new-ret-modal")?.classList.remove("hidden");
  // Pre-select a purchase order if provided
  if (presetPoId) {
    selectReturnPO(presetPoId);
  }
}

function closeNewReturnModal() {
  $("#new-ret-modal")?.classList.add("hidden");
  _retItemsData = [];
}

function setReturnType(type) {
  _returnType = type;
  // Toggle active styling on type buttons
  const cBtn = $("#ret-type-customer");
  const sBtn = $("#ret-type-supplier");
  if (cBtn) {
    if (type === "customer") {
      cBtn.className = "primary";
      cBtn.style.flex = "1";
    } else {
      cBtn.className = "";
      cBtn.style = "flex:1;background:#374151;color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;";
    }
  }
  if (sBtn) {
    if (type === "supplier") {
      sBtn.className = "primary";
      sBtn.style.flex = "1";
    } else {
      sBtn.className = "";
      sBtn.style = "flex:1;background:#374151;color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;";
    }
  }
  // Toggle groups
  const invGroup = $("#ret-invoice-group");
  const poGroup  = $("#ret-po-group");
  const refGroup = $("#ret-refund-group");
  if (invGroup) invGroup.classList.toggle("hidden", type !== "customer");
  if (poGroup)  poGroup.classList.toggle("hidden", type !== "supplier");
  if (refGroup) refGroup.classList.toggle("hidden", type !== "customer");
  // Reset items when switching type
  $("#ret-items-section")?.classList.add("hidden");
  $("#ret-summary")?.classList.add("hidden");
  const itemsList = $("#ret-items-list");
  if (itemsList) itemsList.innerHTML = "";
  if (type === "customer") {
    const s = $("#ret-invoice-search"); if (s) s.value = "";
    const h = $("#ret-invoice-id"); if (h) h.value = "";
  } else {
    const s = $("#ret-po-search"); if (s) s.value = "";
    const h = $("#ret-po-id"); if (h) h.value = "";
  }
}

function searchReturnInvoice(q) {
  const dd = $("#ret-invoice-dropdown");
  if (!dd) return;
  if (!q.trim()) { dd.classList.add("hidden"); return; }
  const term = q.toLowerCase();
  const matches = invoices.filter((inv) => {
    const cust = (inv.customer?.name || "").toLowerCase();
    return inv.id.toLowerCase().includes(term) || cust.includes(term);
  }).slice(0, 8);
  if (!matches.length) { dd.innerHTML = '<div style="padding:10px;color:var(--muted);">No invoices found</div>'; dd.classList.remove("hidden"); return; }
  dd.innerHTML = matches.map((inv) => {
    const custName = inv.customer?.name || "Walk-in";
    const dateStr = new Date(inv.date).toLocaleDateString();
    return `<div onclick="selectReturnInvoice('${inv.id}')" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);" 
      onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
      <strong>${escapeHtml(inv.id)}</strong> — ${escapeHtml(custName)}
      <span style="float:right;color:var(--muted);font-size:12px;">${dateStr} · ${fmtCurrency(inv.total)}</span>
    </div>`;
  }).join("");
  dd.classList.remove("hidden");
}

function selectReturnInvoice(id) {
  const inv = invoices.find((i) => i.id === id);
  if (!inv) return;
  $("#ret-invoice-id").value = id;
  $("#ret-invoice-search").value = `${id} — ${inv.customer?.name || "Walk-in"}`;
  $("#ret-invoice-dropdown")?.classList.add("hidden");
  populateReturnItems(inv.items || [], "customer", inv);
}

function searchReturnPO(q) {
  const dd = $("#ret-po-dropdown");
  if (!dd) return;
  if (!q.trim()) { dd.classList.add("hidden"); return; }
  const term = q.toLowerCase();
  const matches = purchases.filter((po) => {
    return (po.id || "").toLowerCase().includes(term) ||
      (po.supplier || "").toLowerCase().includes(term) ||
      (po.supplierName || "").toLowerCase().includes(term);
  }).slice(0, 8);
  if (!matches.length) { dd.innerHTML = '<div style="padding:10px;color:var(--muted);">No purchase orders found</div>'; dd.classList.remove("hidden"); return; }
  dd.innerHTML = matches.map((po) => {
    const supName = po.supplierName || po.supplier || "—";
    const dateStr = po.date ? new Date(po.date).toLocaleDateString() : "—";
    return `<div onclick="selectReturnPO('${po.id}')" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);"
      onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
      <strong>${escapeHtml(po.id)}</strong> — ${escapeHtml(supName)}
      <span style="float:right;color:var(--muted);font-size:12px;">${dateStr} · ${fmtCurrency(po.totalCost || 0)}</span>
    </div>`;
  }).join("");
  dd.classList.remove("hidden");
}

function selectReturnPO(id) {
  const po = purchases.find((p) => p.id === id);
  if (!po) return;
  $("#ret-po-id").value = id;
  const supName = po.supplierName || po.supplier || "—";
  const shortId = "#" + id.slice(-6);
  $("#ret-po-search").value = `${id} — ${supName}`;
  $("#ret-po-dropdown")?.classList.add("hidden");
  // Show info bar
  const infoBar = $("#ret-po-info-bar");
  if (infoBar) {
    $("#ret-po-info-name").textContent = supName;
    const dateStr = po.date ? new Date(po.date).toLocaleDateString() : "—";
    const totalItems = (po.items || []).reduce((s, i) => s + (i.qty || 0), 0);
    $("#ret-po-info-meta").textContent = `PO ${shortId} · ${dateStr} · ${totalItems} item(s) · ${fmtCurrency(po.totalCost || 0)}`;
    infoBar.classList.remove("hidden");
    $("#ret-po-search").style.display = "none";
  }
  populateReturnItems(po.items || [], "supplier", po);
}

function clearReturnPO() {
  const s = $("#ret-po-search"); if (s) { s.value = ""; s.style.display = ""; }
  const h = $("#ret-po-id"); if (h) h.value = "";
  $("#ret-po-info-bar")?.classList.add("hidden");
  $("#ret-items-section")?.classList.add("hidden");
  $("#ret-details-step")?.classList.add("hidden");
  $("#ret-summary")?.classList.add("hidden");
  const itemsList = $("#ret-items-list");
  if (itemsList) itemsList.innerHTML = "";
  _retItemsData = [];
}

function populateReturnItems(items, type, ref) {
  const section = $("#ret-items-section");
  const list    = $("#ret-items-list");
  if (!section || !list) return;

  // Store items in module-level variable for reliable access in saveReturn()
  _retItemsData = items.map((item) => {
    const qty       = Number(item.qty || item.quantity || 1);
    const unitPrice = Number(type === "customer"
      ? (item.price || item.unitCost || 0)
      : (item.unitCost || item.cost || item.price || 0));
    return {
      name:      item.name || item.productName || "Unknown",
      productId: item.productId || item.id || "",
      qty,
      unitPrice,
    };
  });

  if (!_retItemsData.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:13px;">No items found in this record.</p>';
    section.classList.remove("hidden");
    return;
  }

  list.innerHTML = _retItemsData.map((item, idx) => `
    <div class="ret-item-card">
      <div>
        <div class="ret-item-name">${escapeHtml(item.name)}</div>
        <div class="ret-item-meta">Available: ${item.qty} unit(s) &nbsp;·&nbsp; ${fmtCurrency(item.unitPrice)} each</div>
      </div>
      <div class="ret-qty-wrap">
        <span class="ret-qty-label">Return Qty:</span>
        <input id="ret-qty-${idx}" type="number" min="0" max="${item.qty}" value="0"
          class="ret-qty-input" oninput="updateReturnTotal()" />
      </div>
      <div id="ret-line-${idx}" class="ret-line-total">${fmtCurrency(0)}</div>
    </div>`).join("");

  section.classList.remove("hidden");
  $("#ret-details-step")?.classList.remove("hidden");
  $("#ret-summary")?.classList.remove("hidden");
  updateReturnTotal();
}

function updateReturnTotal() {
  let total = 0;
  _retItemsData.forEach((item, idx) => {
    const input = $(`#ret-qty-${idx}`);
    const qty   = Math.min(Number(input?.value) || 0, item.qty);
    const line  = qty * item.unitPrice;
    total += line;
    const lineEl = $(`#ret-line-${idx}`);
    if (lineEl) lineEl.textContent = fmtCurrency(line);
  });
  const disp = $("#ret-total-display");
  if (disp) disp.textContent = fmtCurrency(total);
}

function generateReturnId() {
  const existing = returns.map((r) => {
    const m = (r.id || "").match(/RET-(\d+)/);
    return m ? parseInt(m[1]) : 0;
  });
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return "RET-" + String(next).padStart(4, "0");
}

function saveReturn() {
  const type = _returnType;

  // Collect items using _retItemsData (reliable, not DOM class-based)
  const selectedItems = [];
  _retItemsData.forEach((item, idx) => {
    const input = $(`#ret-qty-${idx}`);
    const qty   = Math.min(Number(input?.value) || 0, item.qty);
    if (qty <= 0) return;
    selectedItems.push({
      productId: item.productId,
      name:      item.name,
      qty,
      unitPrice: item.unitPrice,
      total:     qty * item.unitPrice,
    });
  });

  if (!selectedItems.length) {
    alert("Please enter a quantity > 0 for at least one item.");
    return;
  }

  const reason = $("#ret-reason").value;
  if (!reason) { alert("Please select a reason for the return."); return; }

  // Validate reference
  let referenceId = "", customerName = "", customerId = "", supplierName = "", supplierId = "";
  if (type === "customer") {
    referenceId = $("#ret-invoice-id")?.value;
    if (!referenceId) { alert("Please select an invoice."); return; }
    const inv = invoices.find((i) => i.id === referenceId);
    customerName = inv?.customer?.name || "Walk-in";
    customerId   = inv?.customer?.id || "";
  } else {
    referenceId = $("#ret-po-id")?.value;
    if (!referenceId) { alert("Please select a purchase order."); return; }
    const po = purchases.find((p) => p.id === referenceId);
    supplierName = po?.supplierName || po?.supplier || "—";
    supplierId   = po?.supplierId || "";
  }

  const totalAmount  = selectedItems.reduce((s, i) => s + i.total, 0);
  const refundMethod = type === "customer" ? ($("#ret-refund-method")?.value || "cash") : null;
  const notes        = $("#ret-notes")?.value.trim() || "";

  // Adjust inventory
  selectedItems.forEach((item) => {
    if (!item.productId) return;
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return;
    if (type === "customer") {
      // Customer return → stock comes back
      prod.stock = (Number(prod.stock) || 0) + item.qty;
    } else {
      // Supplier return → stock goes out
      prod.stock = Math.max(0, (Number(prod.stock) || 0) - item.qty);
    }
  });

  const ret = {
    id: generateReturnId(),
    type,
    date: new Date().toISOString(),
    referenceId,
    customerName,
    customerId,
    supplierName,
    supplierId,
    items: selectedItems,
    reason,
    refundMethod,
    totalAmount,
    notes,
  };

  returns.push(ret);
  saveSome("returns", "products");
  closeNewReturnModal();
  renderReturnsView();
  renderProductsTable();
  alert(`✅ Return ${ret.id} processed!\nInventory has been adjusted.`);
}

// ==================== PURCHASING SYSTEM ====================
function updatePurchaseProductSuggestions() {
  const dl = $("#purchase-product-suggestions");
  if (!dl) return;
  const opts = products
    .map(
      (p) =>
        `<option value="${escapeHtml(p.name)}" data-sku="${escapeHtml(p.sku)}">`,
    )
    .join("");
  dl.innerHTML = opts;
}

function autofillPricesFromCost() {
  const cfg = window.APP_CONFIG || {};
  // Check APP_CONFIG first; fall back to live DOM checkbox so it works
  // even before the user has saved settings for the first time.
  const enabled =
    cfg.autoPriceCalc !== undefined
      ? !!cfg.autoPriceCalc
      : (document.getElementById("cfg-autoPriceCalc")?.checked ?? false);
  if (!enabled) return;

  const cost = parseFloat($("#purchase-item-cost")?.value) || 0;
  if (cost <= 0) return;

  // Prefer APP_CONFIG values; fall back to live Settings inputs; then hardcoded defaults.
  const wPct = parseFloat(
    cfg.wholesaleMarkup ??
    document.getElementById("cfg-wholesaleMarkup")?.value ??
    20
  );
  const bPct = parseFloat(
    cfg.bestMarkup ??
    document.getElementById("cfg-bestMarkup")?.value ??
    30
  );
  const rPct = parseFloat(
    cfg.retailMarkup ??
    document.getElementById("cfg-retailMarkup")?.value ??
    25
  );

  const round2 = (v) => Math.round(v * 100) / 100;
  const wEl = $("#purchase-item-wholesale");
  const bEl = $("#purchase-item-best");
  const rEl = $("#purchase-item-retail");
  if (wEl) wEl.value = round2(cost * (1 + wPct / 100));
  if (bEl) bEl.value = round2(cost * (1 + bPct / 100));
  if (rEl) rEl.value = round2(cost * (1 + rPct / 100));
}

function addPurchaseItem() {
  const searchVal = $("#purchase-item-search")?.value.trim();
  const qty = Number($("#purchase-item-qty")?.value) || 1;
  const costPrice = Number($("#purchase-item-cost")?.value) || 0;
  const wholesalePrice = Number($("#purchase-item-wholesale")?.value) || 0;
  const bestPrice = Number($("#purchase-item-best")?.value) || 0;
  const retailPrice = Number($("#purchase-item-retail")?.value) || 0;
  const supplierSerial = $("#purchase-item-serial")?.value.trim() || "";

  if (!searchVal) {
    alert("Please enter a product name or SKU");
    return;
  }
  if (qty < 1) {
    alert("Quantity must be at least 1");
    return;
  }
  if (costPrice <= 0) {
    alert("Please enter a valid cost price");
    return;
  }

  const existing = products.find(
    (p) =>
      p.name.toLowerCase() === searchVal.toLowerCase() ||
      p.sku.toLowerCase() === searchVal.toLowerCase(),
  );

  const item = {
    id: existing ? existing.id : genId(),
    sku: existing ? existing.sku : genProductCode(),
    name: existing ? existing.name : searchVal,
    qty,
    costPrice,
    wholesalePrice: wholesalePrice || 0,
    bestPrice: bestPrice || 0,
    retailPrice: retailPrice || costPrice,
    supplierSerial,
    isNewProduct: !existing,
  };

  purchaseItems.push(item);
  renderPurchaseCart();

  if ($("#purchase-item-search")) $("#purchase-item-search").value = "";
  if ($("#purchase-item-qty")) $("#purchase-item-qty").value = 1;
  if ($("#purchase-item-cost")) $("#purchase-item-cost").value = "";
  if ($("#purchase-item-wholesale")) $("#purchase-item-wholesale").value = "";
  if ($("#purchase-item-best")) $("#purchase-item-best").value = "";
  if ($("#purchase-item-retail")) $("#purchase-item-retail").value = "";
  if ($("#purchase-item-serial")) $("#purchase-item-serial").value = "";
  $("#purchase-item-search")?.focus();
}

function renderPurchaseCart() {
  const tbody = $("#purchase-cart-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (purchaseItems.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--muted);">No items added yet</td></tr>';
    updatePurchaseTotals();
    return;
  }

  purchaseItems.forEach((item, index) => {
    const totalCost = item.qty * item.costPrice;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.sku)}${item.isNewProduct ? ' <span style="font-size:10px; color:var(--success);">NEW</span>' : ""}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${item.supplierSerial ? escapeHtml(item.supplierSerial) : '<span style="color:var(--muted);font-size:11px;">—</span>'}</td>
      <td>${item.qty}</td>
      <td>${fmtCurrency(item.costPrice)}</td>
      <td>${item.wholesalePrice > 0 ? fmtCurrency(item.wholesalePrice) : '<span style="color:var(--muted);font-size:11px;">—</span>'}</td>
      <td>${item.bestPrice > 0 ? fmtCurrency(item.bestPrice) : '<span style="color:var(--muted);font-size:11px;">—</span>'}</td>
      <td>${fmtCurrency(item.retailPrice)}</td>
      <td>${fmtCurrency(totalCost)}</td>
      <td><button class="small danger remove-purchase-item" data-index="${index}">Remove</button></td>
    `;
    tbody.appendChild(tr);
  });

  qsa(".remove-purchase-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.index);
      purchaseItems.splice(idx, 1);
      renderPurchaseCart();
    });
  });

  updatePurchaseTotals();
}

function updatePurchaseTotals() {
  const totalItems = purchaseItems.reduce((s, i) => s + i.qty, 0);
  const totalCost = purchaseItems.reduce((s, i) => s + i.qty * i.costPrice, 0);
  const tiEl = $("#purchase-total-items");
  const tcEl = $("#purchase-total-cost");
  if (tiEl) tiEl.textContent = totalItems;
  if (tcEl) tcEl.textContent = fmtCurrency(totalCost);
}

function savePurchase() {
  const supplierId = $("#purchase-supplier-id")?.value.trim();
  const supplierObj = suppliers.find((s) => s.id === supplierId);
  const supplierName = supplierObj ? supplierObj.name : "";
  const date = $("#purchase-date")?.value || todayISO();
  const ref = $("#purchase-ref")?.value.trim() || "";
  const payment = $("#purchase-payment")?.value || "cash";
  const notes = $("#purchase-notes")?.value.trim() || "";

  if (!supplierId || !supplierName) {
    alert("Please select a supplier");
    return;
  }
  if (purchaseItems.length === 0) {
    alert("Please add at least one item");
    return;
  }

  const totalCost = purchaseItems.reduce((s, i) => s + i.qty * i.costPrice, 0);

  const purchase = {
    id: "PO_" + Date.now(),
    date: new Date(date).toISOString(),
    supplierId,
    supplier: supplierName,
    ref,
    payment,
    notes,
    items: [...purchaseItems],
    totalCost,
    status: "completed",
  };

  // Update inventory
  purchaseItems.forEach((item) => {
    const existing = products.find(
      (p) => p.id === item.id || p.sku === item.sku,
    );
    if (existing) {
      existing.stock += item.qty;
      if (item.costPrice > 0) existing.costPrice = item.costPrice;
      if (item.wholesalePrice > 0) existing.wholesalePrice = item.wholesalePrice;
      if (item.bestPrice > 0) existing.bestPrice = item.bestPrice;
      if (item.retailPrice > 0) existing.price = item.retailPrice;
    } else {
      products.push({
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: "General",
        price: item.retailPrice || item.costPrice,
        costPrice: item.costPrice || undefined,
        wholesalePrice: item.wholesalePrice || undefined,
        bestPrice: item.bestPrice || undefined,
        stock: item.qty,
        code: item.sku,
      });
    }
  });

  purchases.push(purchase);
  saveAllData();
  renderProductsTable();
  renderPurchasesHistory();
  renderSuppliersList();

  // Reset form
  purchaseItems = [];
  renderPurchaseCart();
  if ($("#purchase-supplier-id")) $("#purchase-supplier-id").value = "";
  if ($("#purchase-ref")) $("#purchase-ref").value = "";
  if ($("#purchase-notes")) $("#purchase-notes").value = "";
  if ($("#purchase-date")) $("#purchase-date").value = todayISO();
  if ($("#purchase-payment")) $("#purchase-payment").value = "cash";
  hidePurchaseForm();

  showPurchaseDetailModal(purchase);
}

function showPurchaseDetailModal(p) {
  const modal = $("#purchase-modal");
  const content = $("#purchase-detail-html");
  if (!modal || !content) return;
  _currentPO = p;
  content.innerHTML = buildPurchaseDetailHTML(p);
  modal.classList.remove("hidden");
}

function buildPurchaseDetailHTML(p) {
  const headerCol = L("invoiceHeaderColor", "#1a3a5c");
  const bizName   = escapeHtml(L("businessName", "") || L("appName", "Zyphra POS"));
  const bizTagline = escapeHtml(L("appTagline", "") || "");
  const bizAddr   = L("businessAddress", "");
  const bizPhone  = L("businessPhone", "");
  const bizEmail  = L("businessEmail", "");
  const sym       = L("currencySymbol", "Rs");
  const invFoot   = L("invoiceFooter", "Thank you for your business!");

  const thS = `padding:7px 8px;font-size:11px;font-weight:700;text-align:left;border-bottom:2px solid ${headerCol};color:${headerCol};background:#fafcff;`;
  const tdS = `padding:6px 8px;font-size:11px;border-bottom:1px solid #e9ecef;vertical-align:top;color:#222;`;

  const rows = p.items.map((it) => `
    <tr>
      <td style="${tdS}">
        <div style="font-weight:600;">${escapeHtml(it.name)}</div>
        ${it.sku ? `<div style="font-size:9px;color:#6c757d;margin-top:2px;">SKU: ${escapeHtml(it.sku)}</div>` : ""}
      </td>
      <td style="${tdS}color:#6c757d;font-size:10px;">${it.supplierSerial ? escapeHtml(it.supplierSerial) : "—"}</td>
      <td style="${tdS}text-align:center;">${it.qty}</td>
      <td style="${tdS}text-align:right;">${fmtCurrency(it.costPrice)}</td>
      <td style="${tdS}text-align:right;color:#6c757d;">${fmtCurrency(it.retailPrice)}</td>
      <td style="${tdS}text-align:right;font-weight:700;">${fmtCurrency(it.qty * it.costPrice)}</td>
    </tr>`).join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#fff;color:#000;border-radius:6px;overflow:hidden;">
      <!-- Header banner -->
      <div style="background:${headerCol};padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="color:#fff;font-size:17px;font-weight:800;letter-spacing:0.02em;">${bizName}</div>
          ${bizTagline ? `<div style="color:rgba(255,255,255,0.7);font-size:10px;margin-top:2px;">${bizTagline}</div>` : ""}
          ${bizAddr   ? `<div style="color:rgba(255,255,255,0.75);font-size:10px;margin-top:1px;">${escapeHtml(bizAddr)}</div>` : ""}
          ${bizPhone  ? `<div style="color:rgba(255,255,255,0.75);font-size:10px;">${escapeHtml(bizPhone)}</div>` : ""}
        </div>
        <div style="text-align:right;">
          <div style="color:rgba(255,255,255,0.9);font-size:20px;font-weight:800;letter-spacing:0.06em;">PURCHASE ORDER</div>
          <div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:4px;">${escapeHtml(p.id)}</div>
        </div>
      </div>
      <!-- Meta row -->
      <div style="display:flex;justify-content:space-between;padding:12px 20px 10px;border-bottom:1px solid #e9ecef;font-size:12px;">
        <div style="line-height:1.9;">
          <div><span style="color:#6c757d;">Date:</span> <strong>${formatDateTime(p.date)}</strong></div>
          <div><span style="color:#6c757d;">Payment:</span> <strong>${p.payment.toUpperCase()}</strong></div>
          ${p.ref ? `<div><span style="color:#6c757d;">Ref:</span> <strong>${escapeHtml(p.ref)}</strong></div>` : ""}
        </div>
        <div style="text-align:right;line-height:1.9;">
          <div style="font-size:10px;color:#6c757d;text-transform:uppercase;letter-spacing:0.03em;">Supplier</div>
          <div style="font-size:14px;font-weight:700;color:${headerCol};">${escapeHtml(p.supplier)}</div>
        </div>
      </div>
      <!-- Items table -->
      <div style="padding:14px 20px 8px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="${thS}">Product</th>
              <th style="${thS}">Supplier S/N</th>
              <th style="${thS}text-align:center;">Qty</th>
              <th style="${thS}text-align:right;">Cost Price</th>
              <th style="${thS}text-align:right;">Retail Price</th>
              <th style="${thS}text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <!-- Totals -->
      <div style="display:flex;justify-content:flex-end;padding:4px 20px 14px;">
        <div style="width:200px;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid ${headerCol};margin-top:4px;">
            <span style="font-size:13px;font-weight:800;color:${headerCol};">TOTAL COST</span>
            <span style="font-size:13px;font-weight:800;color:#000;">${fmtCurrency(p.totalCost)}</span>
          </div>
        </div>
      </div>
      ${p.notes ? `
      <div style="margin:0 20px 14px;padding:8px 12px;background:#f0f4ff;border-left:3px solid ${headerCol};border-radius:4px;font-size:11px;color:#1e293b;">
        <strong>Notes:</strong> ${escapeHtml(p.notes)}
      </div>` : ""}
      <!-- Footer -->
      <div style="border-top:1px solid #e9ecef;padding:10px 20px;text-align:center;font-size:10px;color:#94a3b8;font-style:italic;">
        ${escapeHtml(invFoot)}
      </div>
    </div>`;
}

function buildPurchaseOrderHTML(p) {
  const headerCol = L("invoiceHeaderColor", "#1a3a5c");
  const bizName   = escapeHtml(L("businessName", "") || L("appName", "Zyphra POS"));
  const bizTagline = escapeHtml(L("appTagline", "") || "");
  const bizAddr   = L("businessAddress", "");
  const bizPhone  = L("businessPhone", "");
  const bizEmail  = L("businessEmail", "");
  const showLogo  = L("invoiceShowLogo", true);
  const invFoot   = L("invoiceFooter", "Thank you for your business!");

  const fontLink = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet">`;
  const thStyle  = `padding:8px;font-size:11px;font-weight:600;text-align:left;border-bottom:2px solid ${headerCol};color:${headerCol};background:#fafcff;`;
  const tdStyle  = `padding:6px 8px;font-size:11px;border-bottom:1px solid #e9ecef;vertical-align:top;line-height:1.3;color:#000;`;

  const rows = p.items.map((it) => `
    <tr>
      <td style="${tdStyle}">
        <div style="font-weight:600;">${escapeHtml(it.name)}</div>
        ${it.sku ? `<div style="font-size:9px;color:#6c757d;margin-top:2px;">SKU: ${escapeHtml(it.sku)}</div>` : ""}
      </td>
      <td style="${tdStyle}color:#6c757d;">${it.supplierSerial ? escapeHtml(it.supplierSerial) : "—"}</td>
      <td style="${tdStyle}text-align:center;">${it.qty}</td>
      <td style="${tdStyle}text-align:right;">${fmtCurrency(it.costPrice)}</td>
      <td style="${tdStyle}text-align:right;color:#6c757d;">${fmtCurrency(it.retailPrice)}</td>
      <td style="${tdStyle}text-align:right;font-weight:700;">${fmtCurrency(it.qty * it.costPrice)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Purchase Order — ${escapeHtml(p.id)}</title>
  ${fontLink}
  <style>
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f1f4f8; display: flex; flex-direction: column; align-items: center; padding: 20px 0; }
    .toolbar { width: 210mm; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 18px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
    .toolbar h2 { flex: 1; font-size: 14px; font-weight: 700; color: #1f2937; }
    .toolbar button { padding: 7px 18px; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .page { background: #fff; width: 210mm; min-height: 297mm; box-shadow: 0 20px 35px -10px rgba(0,0,0,0.1); position: relative; overflow: hidden; }
    .page-inner { padding: 12mm 14mm; display: flex; flex-direction: column; min-height: 297mm; }
  </style>
</head>
<body>
<div class="toolbar no-print">
  <h2>🛒 Purchase Order — ${escapeHtml(p.id)}</h2>
  <button onclick="window.print()" style="background:#059669;">🖨 Print Now</button>
  <button onclick="window.close()" style="background:#374151;">✕ Close</button>
</div>
<div class="page">
  <div class="page-inner">

    <!-- HEADER -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6mm;">
      <div>
        ${showLogo ? `<img src="/assets/logo.jpeg" alt="${bizName}" style="height:28mm;width:auto;object-fit:contain;" onerror="this.style.display='none'" />` : ""}
      </div>
      <div style="font-size:26pt;font-weight:800;letter-spacing:0.04em;color:${headerCol};">PURCHASE ORDER</div>
    </div>

    <!-- Supplier + Business Details -->
    <div style="display:flex;justify-content:space-between;margin-bottom:6mm;">
      <div style="width:48%;">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.03em;color:#6c757d;margin-bottom:2mm;">Supplier</div>
        <div style="font-size:14pt;font-weight:700;color:#000;">${escapeHtml(p.supplier)}</div>
        ${p.ref ? `<div style="font-size:9pt;color:#555;margin-top:2mm;">Ref: ${escapeHtml(p.ref)}</div>` : ""}
      </div>
      <div style="width:48%;text-align:right;">
        <div style="font-size:11pt;font-weight:700;color:${headerCol};">${bizName}</div>
        ${bizTagline ? `<div style="font-size:8pt;color:#6c757d;margin-top:1mm;">${bizTagline}</div>` : ""}
        ${bizAddr   ? `<div style="font-size:8pt;color:#000;margin-top:1mm;">${escapeHtml(bizAddr)}</div>` : ""}
        ${bizPhone  ? `<div style="font-size:8pt;color:#000;">${escapeHtml(bizPhone)}</div>` : ""}
        ${bizEmail  ? `<div style="font-size:8pt;color:#000;">${escapeHtml(bizEmail)}</div>` : ""}
      </div>
    </div>

    <!-- PO Meta strip -->
    <div style="display:flex;gap:8mm;margin-bottom:5mm;padding:3mm 4mm;background:#fafcff;border:1px solid #e9ecef;border-radius:4px;font-size:9pt;">
      <div><span style="color:#6c757d;">PO ID:</span> <strong>${escapeHtml(p.id)}</strong></div>
      <div><span style="color:#6c757d;">Date:</span> <strong>${formatDateTime(p.date)}</strong></div>
      <div><span style="color:#6c757d;">Payment:</span> <strong>${p.payment.toUpperCase()}</strong></div>
    </div>

    <!-- Items table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:4mm;">
      <thead>
        <tr>
          <th style="${thStyle}">Product</th>
          <th style="${thStyle}">Supplier Serial No.</th>
          <th style="${thStyle}text-align:center;">Qty</th>
          <th style="${thStyle}text-align:right;">Cost Price</th>
          <th style="${thStyle}text-align:right;">Retail Price</th>
          <th style="${thStyle}text-align:right;">Total Cost</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:5mm;">
      <div style="width:70mm;">
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <tr>
            <td style="padding:5mm 3mm 5mm 0;font-size:12pt;font-weight:800;color:${headerCol};border-top:2px solid ${headerCol};">TOTAL COST</td>
            <td style="padding:5mm 0;font-size:12pt;font-weight:800;text-align:right;color:#000;border-top:2px solid ${headerCol};">${fmtCurrency(p.totalCost)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Notes -->
    ${p.notes ? `
    <div style="margin-bottom:5mm;padding:2mm 3mm;background:#f0f4ff;border-left:3px solid ${headerCol};font-size:8pt;color:#1e293b;border-radius:4px;">
      <strong>Notes:</strong> ${escapeHtml(p.notes)}
    </div>` : ""}

    <!-- Spacer -->
    <div style="flex:1;min-height:10mm;"></div>

    <!-- Bottom: footer + signature -->
    <div style="margin-top:auto;">
      <div style="border-top:1px solid #e2e8f0;margin-bottom:6mm;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div style="font-size:9pt;line-height:1.6;color:#000;">
          <div><span style="color:#6c757d;">PO No. —</span> <strong>${escapeHtml(p.id)}</strong></div>
          <div><span style="color:#6c757d;">Date —</span> ${formatDateTime(p.date)}</div>
          <div><span style="color:#6c757d;">Payment —</span> ${p.payment.toUpperCase()}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11pt;font-weight:600;color:${headerCol};">${escapeHtml(invFoot)}</div>
          <div style="margin-top:9mm;">
            <div style="width:55mm;border-bottom:1.5px solid #cbd5e1;margin-left:auto;"></div>
            <div style="font-size:8pt;color:#94a3b8;margin-top:2mm;">Authorized Signature</div>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>
</body>
</html>`;
}

function printCurrentPurchaseOrder() {
  if (!_currentPO) return;
  const w = window.open("", "_blank", "width=860,height=900");
  if (!w) { alert("Pop-up blocked — please allow pop-ups for this site."); return; }
  w.document.write(buildPurchaseOrderHTML(_currentPO));
  w.document.close();
}

function renderPurchasesHistory() {
  const tbody = $("#purchases-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const payBadgeMap = {
    cash:   { cls: "pay-cash",   icon: "fa-money-bill-wave", label: "Cash" },
    bank:   { cls: "pay-bank",   icon: "fa-university",      label: "Bank" },
    card:   { cls: "pay-card",   icon: "fa-credit-card",     label: "Card" },
    credit: { cls: "pay-credit", icon: "fa-file-invoice",    label: "Credit" },
  };

  const search = $("#purchase-search")?.value.toLowerCase() || "";
  const filtered = purchases.filter(
    (p) =>
      !search ||
      p.supplier.toLowerCase().includes(search) ||
      (p.ref && p.ref.toLowerCase().includes(search)) ||
      p.id.toLowerCase().includes(search),
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted);"><i class="fa fa-truck" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.4;"></i>No purchases yet</td></tr>`;
    return;
  }

  [...filtered].reverse().forEach((p) => {
    const totalItems = p.items.reduce((s, i) => s + i.qty, 0);
    const pay = payBadgeMap[p.payment] || { cls: "pay-cash", icon: "fa-money-bill", label: p.payment.toUpperCase() };
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="code-chip" title="${p.id}">#${p.id.slice(-6)}</span></td>
      <td class="hide-mobile" style="color:var(--muted);font-size:13px;">${formatDate(p.date)}</td>
      <td><div class="cell-name-sub"><span class="cname">${escapeHtml(p.supplier)}</span>${p.ref ? `<span class="csub">Ref: ${escapeHtml(p.ref)}</span>` : ""}</div></td>
      <td class="hide-sm" style="color:var(--muted);font-size:13px;">${totalItems} item(s)</td>
      <td class="amt-blue">${fmtCurrency(p.totalCost)}</td>
      <td class="hide-mobile"><span class="pay-badge ${pay.cls}"><i class="fa ${pay.icon}"></i> ${pay.label}</span></td>
      <td><div class="action-btns">
        <button class="sec-action-btn ab-view view-purchase" data-id="${p.id}"><i class="fa fa-eye"></i> <span>View</span></button>
        <button class="sec-action-btn ab-edit return-purchase" data-id="${p.id}" title="Create supplier return" style="background:rgba(139,92,246,0.15);color:#a78bfa;border-color:rgba(139,92,246,0.3);"><i class="fa fa-undo"></i></button>
        <button class="sec-action-btn ab-del delete-purchase" data-id="${p.id}"><i class="fa fa-trash"></i></button>
      </div></td>
    `;
    tbody.appendChild(tr);
  });

  qsa(".view-purchase").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.closest("[data-id]").dataset.id;
      const p = purchases.find((x) => x.id === id);
      if (p) showPurchaseDetailModal(p);
    });
  });

  qsa(".return-purchase").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.closest("[data-id]").dataset.id;
      openNewReturnModal("supplier", id);
    });
  });

  qsa(".delete-purchase").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (confirm("Delete this purchase record?")) {
        const id = e.target.closest("[data-id]").dataset.id;
        purchases = purchases.filter((x) => x.id !== id);
        saveAllData();
        renderPurchasesHistory();
      }
    });
  });
}

function showPurchaseForm(presetSupplierId = "") {
  const formSection = $("#purchase-form-section");
  const suppliersSection = $("#suppliers-list-section");
  if (!formSection) return;

  if (suppliersSection) suppliersSection.classList.add("hidden");
  formSection.classList.remove("hidden");

  purchaseItems = [];
  renderPurchaseCart();
  if ($("#purchase-date")) $("#purchase-date").value = todayISO();

  populatePurchaseSupplierDropdown(presetSupplierId);

  if (presetSupplierId) {
    const sup = suppliers.find((s) => s.id === presetSupplierId);
    if (sup) {
      const bar = $("#purchase-supplier-info-bar");
      const nameEl = $("#purchase-supplier-name-display");
      const subEl = $("#purchase-supplier-sub-display");
      if (bar && nameEl) {
        nameEl.textContent = sup.name;
        if (subEl) subEl.textContent = [sup.contact, sup.phone].filter(Boolean).join(" · ");
        bar.style.display = "flex";
      }
      const selGroup = $("#purchase-supplier-select-group");
      if (selGroup) selGroup.style.display = "none";
    }
  } else {
    const bar = $("#purchase-supplier-info-bar");
    if (bar) bar.style.display = "none";
    const selGroup = $("#purchase-supplier-select-group");
    if (selGroup) selGroup.style.display = "";
  }

  formSection.scrollIntoView({ behavior: "smooth" });
}

function hidePurchaseForm() {
  const formSection = $("#purchase-form-section");
  if (formSection) formSection.classList.add("hidden");
  const suppliersSection = $("#suppliers-list-section");
  if (suppliersSection) suppliersSection.classList.remove("hidden");
  purchaseItems = [];
  const bar = $("#purchase-supplier-info-bar");
  if (bar) bar.style.display = "none";
  const selGroup = $("#purchase-supplier-select-group");
  if (selGroup) selGroup.style.display = "";
}

// ==================== ANALYTICS & REPORTS ====================
function initMonthlyReportControls() {
  const yearSel = $("#report-year");
  const monthSel = $("#report-month");
  if (!yearSel || !monthSel) return;
  if (yearSel.dataset.init === "1") return;
  yearSel.dataset.init = "1";

  // Determine year range from invoices (fallback to current year)
  const years = new Set();
  invoices.forEach((i) => {
    try {
      years.add(new Date(i.date).getFullYear());
    } catch (e) {}
  });
  const now = new Date();
  years.add(now.getFullYear());
  const sortedYears = Array.from(years).sort((a, b) => b - a);
  yearSel.innerHTML = sortedYears
    .map((y) => `<option value="${y}">${y}</option>`)
    .join("");

  // Default to current month/year
  yearSel.value = String(now.getFullYear());
  monthSel.value = String(now.getMonth() + 1);
}

async function downloadMonthlyReport() {
  const yearSel = $("#report-year");
  const monthSel = $("#report-month");
  const btn = $("#btn-download-monthly-report");
  if (!yearSel || !monthSel || !btn) return;

  const year = parseInt(yearSel.value, 10);
  const month = parseInt(monthSel.value, 10);
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

  try {
    const res = await fetch(
      `/api/reports/monthly-pdf?year=${year}&month=${month}`,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error (${res.status})`);
    }
    const blob = await res.blob();
    const monthName = new Date(year, month - 1, 1).toLocaleString("en-GB", {
      month: "short",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Monthly_Report_${monthName}_${year}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    alert("Failed to download report: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

// ── Period range helpers ─────────────────────────────────
function getPeriodRange(period) {
  const now = new Date();
  let start, end, prevStart, prevEnd, label, trendDays;
  end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (period === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 1);
    prevEnd   = new Date(end);   prevEnd.setDate(prevEnd.getDate() - 1);
    label = "Today"; trendDays = 1;
  } else if (period === "week") {
    start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0,0,0,0);
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 6); prevStart.setHours(0,0,0,0);
    label = "Last 7 days"; trendDays = 7;
  } else if (period === "year") {
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd   = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
    label = "This year"; trendDays = 12;
  } else { // month
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd   = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 23, 59, 59, 999);
    label = "This month"; trendDays = 30;
  }
  return { start, end, prevStart, prevEnd, label, trendDays };
}

function inRange(dateStr, start, end) {
  const t = new Date(dateStr).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function trendBadge(curr, prev) {
  if (!prev || prev === 0) {
    if (curr > 0) return { html: `<i class="fas fa-arrow-up"></i> NEW`, cls: "up" };
    return { html: `—`, cls: "flat" };
  }
  const pct = ((curr - prev) / prev) * 100;
  const cls = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const arrow = pct > 0.5 ? "fa-arrow-up" : pct < -0.5 ? "fa-arrow-down" : "fa-minus";
  return { html: `<i class="fas ${arrow}"></i> ${Math.abs(pct).toFixed(1)}%`, cls };
}

function initPeriodTabs() {
  const wrap = $("#period-tabs");
  if (!wrap || wrap.dataset.init === "1") return;
  wrap.dataset.init = "1";
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".period-tab");
    if (!btn) return;
    const p = btn.getAttribute("data-period");
    if (!p || p === analyticsPeriod) return;
    analyticsPeriod = p;
    wrap.querySelectorAll(".period-tab").forEach((b) =>
      b.classList.toggle("active", b.getAttribute("data-period") === p)
    );
    updateDashboard();
  });
  // Make sure active class matches current state
  wrap.querySelectorAll(".period-tab").forEach((b) =>
    b.classList.toggle("active", b.getAttribute("data-period") === analyticsPeriod)
  );
}

function updateDashboard() {
  initMonthlyReportControls();
  initPeriodTabs();
  const r = getPeriodRange(analyticsPeriod);

  const periodInvoices = invoices.filter((i) => inRange(i.date, r.start, r.end));
  const periodExpenses = expenses.filter((e) => inRange(e.date || e.createdAt, r.start, r.end));
  const prevInvoices   = invoices.filter((i) => inRange(i.date, r.prevStart, r.prevEnd));
  const prevExpenses   = expenses.filter((e) => inRange(e.date || e.createdAt, r.prevStart, r.prevEnd));

  const revenue   = periodInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const expensesT = periodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  // Calculate COGS from invoice items using product costPrice
  let cogs = 0;
  periodInvoices.forEach((inv) => {
    (inv.items || []).forEach((it) => {
      const prod = products.find((x) => x.id === it.id || x.sku === it.sku);
      const cost = Number((prod && prod.costPrice) || it.costPrice || 0);
      cogs += cost * Number(it.qty || 1);
    });
  });
  const profit    = revenue - cogs - expensesT;
  const orders    = periodInvoices.length;
  const aov       = orders ? revenue / orders : 0;

  const prevRevenue = prevInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  let prevCogs = 0;
  prevInvoices.forEach((inv) => {
    (inv.items || []).forEach((it) => {
      const prod = products.find((x) => x.id === it.id || x.sku === it.sku);
      const cost = Number((prod && prod.costPrice) || it.costPrice || 0);
      prevCogs += cost * Number(it.qty || 1);
    });
  });
  const prevProfit  = prevRevenue - prevCogs - prevExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const prevOrders  = prevInvoices.length;
  const prevAov     = prevOrders ? prevRevenue / prevOrders : 0;

  // Update KPI cards
  const setKpi = (id, value, sub, trend) => {
    const v = $(`#kpi-${id}-value`);    if (v) v.textContent = value;
    const t = $(`#kpi-${id}-trend`);    if (t) { t.innerHTML = trend.html; t.className = `kpi-trend trend-${trend.cls}`; }
    const s = $(`#kpi-${id}-sub`);      if (s) s.textContent = sub;
  };
  setKpi("revenue", fmtCurrency(revenue), `vs ${fmtCurrency(prevRevenue)} previous`, trendBadge(revenue, prevRevenue));
  setKpi("profit",  fmtCurrency(profit),  `COGS: ${fmtCurrency(cogs)} · expenses: ${fmtCurrency(expensesT)}`,     trendBadge(profit, prevProfit));
  setKpi("orders",  String(orders),       `previous: ${prevOrders}`,                 trendBadge(orders, prevOrders));
  setKpi("aov",     fmtCurrency(aov),     `per invoice this period`,                 trendBadge(aov, prevAov));

  // Smart insights
  renderSmartInsights(periodInvoices, periodExpenses, prevInvoices, r);

  // Stock alerts
  const lowStockItems = products
    .filter((p) => Number(p.stock) <= LOW_STOCK_THRESH)
    .sort((a, b) => Number(a.stock) - Number(b.stock));
  const stockAlert = $("#low-stock-alert");
  const stockSub   = $("#stock-alert-sub");
  if (stockSub) stockSub.textContent = lowStockItems.length > 0
    ? `${lowStockItems.length} item${lowStockItems.length === 1 ? "" : "s"} need restocking`
    : "All stock levels normal";
  if (stockAlert) {
    if (lowStockItems.length > 0) {
      stockAlert.innerHTML = lowStockItems.slice(0, 6).map((p) => {
        const isOut = Number(p.stock) <= 0;
        return `<div class="stock-alert-row ${isOut ? "stock-out" : "stock-low"}">
          <div class="stock-alert-icon"><i class="fas ${isOut ? "fa-times-circle" : "fa-exclamation-circle"}"></i></div>
          <div class="stock-alert-text">
            <div class="stock-alert-name">${escapeHtml(p.name)}</div>
            <div class="stock-alert-sku">${escapeHtml(p.sku || "")}</div>
          </div>
          <div class="stock-alert-qty">${p.stock} left</div>
        </div>`;
      }).join("");
    } else {
      stockAlert.innerHTML = '<div class="empty-msg"><i class="fas fa-check-circle" style="color:#10b981"></i> All stock levels normal</div>';
    }
  }

  // Top customers (period-aware)
  renderTopCustomersList(periodInvoices);

  renderCharts(periodInvoices, r);
}

function renderSmartInsights(periodInvoices, periodExpenses, prevInvoices, r) {
  const insightsEl = $("#smart-insights");
  if (!insightsEl) return;
  const insights = [];

  const revenue     = periodInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const prevRevenue = prevInvoices.reduce((s, i) => s + Number(i.total || 0), 0);

  // 1. Revenue change
  if (prevRevenue > 0) {
    const pct = ((revenue - prevRevenue) / prevRevenue) * 100;
    if (Math.abs(pct) >= 5) {
      const up = pct > 0;
      insights.push({
        icon: up ? "fa-arrow-trend-up" : "fa-arrow-trend-down",
        color: up ? "#10b981" : "#ef4444",
        text: `Revenue ${up ? "up" : "down"} <strong>${Math.abs(pct).toFixed(1)}%</strong> vs previous period`
      });
    }
  } else if (revenue > 0) {
    insights.push({ icon: "fa-rocket", color: "#8b5cf6", text: `First sales of this period — <strong>${fmtCurrency(revenue)}</strong> earned` });
  }

  // 2. Top item
  const itemAgg = {};
  periodInvoices.forEach((inv) => (inv.items || []).forEach((it) => {
    const k = it.name || it.sku || "—";
    itemAgg[k] = (itemAgg[k] || 0) + Number(it.qty || 0);
  }));
  const topItem = Object.entries(itemAgg).sort((a, b) => b[1] - a[1])[0];
  if (topItem) insights.push({ icon: "fa-fire", color: "#f97316", text: `Best seller: <strong>${escapeHtml(topItem[0])}</strong> (×${topItem[1]} sold)` });

  // 3. Unique customers
  const uniqueCust = new Set(periodInvoices.map((i) => i.customer).filter(Boolean));
  if (uniqueCust.size > 0) insights.push({ icon: "fa-users", color: "#0ea5e9", text: `<strong>${uniqueCust.size}</strong> unique customer${uniqueCust.size === 1 ? "" : "s"} this period` });

  // 4. Peak hour
  const hourAgg = Array(24).fill(0);
  periodInvoices.forEach((inv) => { try { hourAgg[new Date(inv.date).getHours()] += Number(inv.total || 0); } catch (e) {} });
  const maxHour = hourAgg.indexOf(Math.max(...hourAgg));
  if (hourAgg[maxHour] > 0) {
    const fmt = (h) => `${((h % 12) || 12)} ${h < 12 ? "AM" : "PM"}`;
    insights.push({ icon: "fa-clock", color: "#a855f7", text: `Peak hour: <strong>${fmt(maxHour)}–${fmt((maxHour + 1) % 24)}</strong>` });
  }

  // 5. Stock low
  const lowStock = products.filter((p) => Number(p.stock) <= LOW_STOCK_THRESH);
  if (lowStock.length > 0) {
    insights.push({ icon: "fa-triangle-exclamation", color: "#f59e0b", text: `<strong>${lowStock.length}</strong> item${lowStock.length === 1 ? "" : "s"} running low — restock soon` });
  }

  // 6. Expense ratio
  const expensesT = periodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  if (revenue > 0 && expensesT > 0) {
    const ratio = (expensesT / revenue) * 100;
    insights.push({ icon: "fa-balance-scale", color: ratio < 40 ? "#10b981" : ratio < 70 ? "#f59e0b" : "#ef4444",
      text: `Expense ratio: <strong>${ratio.toFixed(1)}%</strong> of revenue` });
  }

  if (insights.length === 0) {
    insightsEl.innerHTML = '<div class="empty-msg" style="padding:14px;">No insights yet — make some sales to see analysis here</div>';
    return;
  }

  insightsEl.innerHTML = insights.map((i) =>
    `<div class="insight-item">
       <div class="insight-icon" style="background:${i.color}22; color:${i.color}"><i class="fas ${i.icon}"></i></div>
       <div class="insight-text">${i.text}</div>
     </div>`).join("");
}

function renderTopCustomersList(periodInvoices) {
  const el = $("#top-customers-list");
  if (!el) return;
  const agg = {};
  periodInvoices.forEach((inv) => {
    const cid = inv.customer || "walk-in";
    if (!agg[cid]) agg[cid] = { id: cid, count: 0, total: 0 };
    agg[cid].count += 1;
    agg[cid].total += Number(inv.total || 0);
  });
  const top = Object.values(agg).map((c) => {
    const cust = customers.find((x) => x.id === c.id);
    return { name: cust ? cust.name : "Walk-in", count: c.count, total: c.total };
  }).sort((a, b) => b.total - a.total).slice(0, 6);

  if (top.length === 0) {
    el.innerHTML = '<div class="empty-msg"><i class="fas fa-user-slash"></i> No customer activity yet</div>';
    return;
  }

  const max = top[0].total || 1;
  const palette = ["#8b5cf6","#06b6d4","#f97316","#10b981","#ef4444","#eab308"];
  el.innerHTML = top.map((c, i) => {
    const initials = (c.name || "?").trim().slice(0, 1).toUpperCase();
    const color = palette[i % palette.length];
    const w = (c.total / max) * 100;
    return `<div class="top-cust-row">
      <div class="top-cust-avatar" style="background:${color}">${escapeHtml(initials)}</div>
      <div class="top-cust-body">
        <div class="top-cust-line">
          <span class="top-cust-name">${escapeHtml(c.name)}</span>
          <span class="top-cust-total">${fmtCurrency(c.total)}</span>
        </div>
        <div class="top-cust-bar"><div class="top-cust-bar-fill" style="width:${w}%; background:${color}"></div></div>
        <div class="top-cust-meta">${c.count} order${c.count === 1 ? "" : "s"}</div>
      </div>
    </div>`;
  }).join("");
}

function renderCharts(periodInvoices, range) {
  // ── Trend chart: build buckets based on period ───────────
  let labels = [], data = [], subLabel = "";
  if (analyticsPeriod === "today") {
    // Hourly today
    labels = Array.from({ length: 24 }, (_, h) => `${(h % 12) || 12}${h < 12 ? "a" : "p"}`);
    data = Array(24).fill(0);
    periodInvoices.forEach((inv) => {
      try { data[new Date(inv.date).getHours()] += Number(inv.total || 0); } catch (e) {}
    });
    subLabel = "Hourly today";
  } else if (analyticsPeriod === "week") {
    const days = []; const map = {};
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      map[key] = 0; days.push(key);
    }
    periodInvoices.forEach((inv) => {
      const d = new Date(inv.date).toISOString().slice(0, 10);
      if (d in map) map[d] += Number(inv.total || 0);
    });
    labels = days.map((d) => new Date(d).toLocaleDateString(CURRENCY_LOCALE, { month: "short", day: "numeric", timeZone: TIMEZONE }));
    data = days.map((d) => map[d]);
    subLabel = "Last 7 days";
  } else if (analyticsPeriod === "month") {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    data = Array(daysInMonth).fill(0);
    periodInvoices.forEach((inv) => {
      try { data[new Date(inv.date).getDate() - 1] += Number(inv.total || 0); } catch (e) {}
    });
    subLabel = "Daily this month";
  } else { // year
    labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    data = Array(12).fill(0);
    periodInvoices.forEach((inv) => {
      try { data[new Date(inv.date).getMonth()] += Number(inv.total || 0); } catch (e) {}
    });
    subLabel = "Monthly this year";
  }
  const subEl = $("#chart-trend-sub"); if (subEl) subEl.textContent = subLabel;

  // ── Revenue Trend (line/area gradient) ────────────────
  const ctx1 = $("#chart-daily")?.getContext("2d");
  if (ctx1) {
    if (chartDaily) chartDaily.destroy();
    const grad = ctx1.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, "rgba(139,92,246,0.55)");
    grad.addColorStop(1, "rgba(139,92,246,0.02)");
    chartDaily = new Chart(ctx1, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Revenue",
          data,
          borderColor: "#a78bfa",
          backgroundColor: grad,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: "#fff",
          pointBorderColor: "#a78bfa",
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15,17,33,0.95)",
            titleColor: "#fff", bodyColor: "#fff",
            padding: 10, cornerRadius: 8,
            callbacks: { label: (c) => fmtCurrency(c.raw) }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#7a85ad", font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { color: "#7a85ad", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        },
      },
    });
  }

  // ── Top Items (horizontal bar) ────────────────────────
  const itemAgg = {};
  periodInvoices.forEach((inv) => (inv.items || []).forEach((it) => {
    const k = it.name || it.sku || "—";
    itemAgg[k] = (itemAgg[k] || 0) + Number(it.qty || 0);
  }));
  const topItems = Object.entries(itemAgg).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const ctx2 = $("#chart-top")?.getContext("2d");
  if (ctx2) {
    if (chartTop) chartTop.destroy();
    const palette = ["#8b5cf6","#06b6d4","#f97316","#10b981","#ef4444","#eab308"];
    chartTop = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: topItems.map(([n]) => n.length > 18 ? n.slice(0, 17) + "…" : n),
        datasets: [{
          data: topItems.map(([_, v]) => v),
          backgroundColor: topItems.map((_, i) => palette[i % palette.length]),
          borderRadius: 6,
          barThickness: 18,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "rgba(15,17,33,0.95)", padding: 10, cornerRadius: 8 },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#7a85ad", font: { size: 10 } } },
          y: { grid: { display: false }, ticks: { color: "#cbd5e1", font: { size: 11 } } },
        },
      },
    });
  }

  // ── Category doughnut ─────────────────────────────────
  const categoryMap = {};
  periodInvoices.forEach((inv) => (inv.items || []).forEach((it) => {
    const p = products.find((x) => x.id === it.id);
    const cat = (p && p.category) || "Other";
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(it.lineTotal || (it.price * it.qty) || 0);
  }));
  const catLabels = Object.keys(categoryMap);
  const ctx3 = $("#chart-category")?.getContext("2d");
  if (ctx3) {
    if (chartCategory) chartCategory.destroy();
    chartCategory = new Chart(ctx3, {
      type: "doughnut",
      data: {
        labels: catLabels,
        datasets: [{
          data: catLabels.map((c) => categoryMap[c]),
          backgroundColor: ["#8b5cf6","#06b6d4","#f97316","#10b981","#ef4444","#eab308","#ec4899","#3b82f6"],
          borderColor: "rgba(15,17,33,0.6)", borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { color: "#cbd5e1", font: { size: 11 }, padding: 12, boxWidth: 10 } },
          tooltip: {
            backgroundColor: "rgba(15,17,33,0.95)",
            callbacks: { label: (c) => `${c.label}: ${fmtCurrency(c.raw)}` }
          }
        },
      },
    });
  }

  // ── Hourly sales pattern (always uses period data) ────
  const hourAgg = Array(24).fill(0);
  periodInvoices.forEach((inv) => {
    try { hourAgg[new Date(inv.date).getHours()] += Number(inv.total || 0); } catch (e) {}
  });
  const ctx4 = $("#chart-hourly")?.getContext("2d");
  if (ctx4) {
    if (chartHourly) chartHourly.destroy();
    const maxH = Math.max(...hourAgg);
    chartHourly = new Chart(ctx4, {
      type: "bar",
      data: {
        labels: Array.from({ length: 24 }, (_, h) => `${(h % 12) || 12}${h < 12 ? "a" : "p"}`),
        datasets: [{
          data: hourAgg,
          backgroundColor: hourAgg.map((v) => {
            if (maxH === 0) return "rgba(168,85,247,0.2)";
            const t = v / maxH;
            return `rgba(168,85,247,${0.18 + t * 0.72})`;
          }),
          borderRadius: 4,
          barThickness: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15,17,33,0.95)", padding: 10, cornerRadius: 8,
            callbacks: { label: (c) => fmtCurrency(c.raw) }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#7a85ad", font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { color: "#7a85ad", font: { size: 9 } } },
        },
      },
    });
  }
}

function populateEmployeeFilter() {
  const sel = $("#invoice-filter-employee");
  if (!sel) return;
  const prev = sel.value;
  const employees = Array.from(
    new Set(invoices.map((i) => i.soldBy).filter(Boolean)),
  ).sort();
  sel.innerHTML =
    '<option value="">All Employees</option>' +
    employees
      .map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`)
      .join("");
  if (prev) sel.value = prev;
}

let invoicesShowAll = false;

function setInvoicesViewMode(showAll) {
  // Always ensure the invoices tab is active (not returns)
  switchInvoiceTab("invoices");
  invoicesShowAll = !!showAll;
  const titleSpan = document.querySelector("#invoices-page-title span");
  if (titleSpan)
    titleSpan.textContent = showAll ? "All Invoices" : "Today's Invoices";

  const filtersBar = $("#invoice-filters-bar");
  const statsRow = $("#invoice-stats-row");
  const viewAllBtn = $("#btn-view-all-invoices");
  const backBtn = $("#btn-back-to-today");
  if (filtersBar) filtersBar.classList.toggle("hidden", !showAll);
  if (statsRow) statsRow.classList.toggle("hidden", showAll);
  if (viewAllBtn) viewAllBtn.classList.toggle("hidden", showAll);
  if (backBtn) backBtn.classList.toggle("hidden", !showAll);

  // Reset filters when leaving "all" mode
  if (!showAll) {
    const ids = [
      "invoice-search",
      "invoice-filter-employee",
      "invoice-filter-doctype",
      "invoice-filter-from",
      "invoice-filter-to",
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }
  renderInvoicesTable();
  if (!showAll) renderTodayInvoiceStats();
}

function renderTodayInvoiceStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todays = invoices.filter((i) => {
    const t = new Date(i.date).getTime();
    return t >= todayStart.getTime() && t <= todayEnd.getTime();
  });

  const count = todays.length;
  const revenue = todays.reduce((s, i) => s + Number(i.total || 0), 0);

  // Top item by quantity sold today
  const itemMap = {};
  todays.forEach((inv) => {
    (inv.items || []).forEach((it) => {
      const key = it.name || it.sku || "—";
      const qty = Number(it.qty) || 1;
      itemMap[key] = (itemMap[key] || 0) + qty;
    });
  });
  let topName = "—",
    topQty = 0;
  Object.entries(itemMap).forEach(([k, v]) => {
    if (v > topQty) {
      topName = k;
      topQty = v;
    }
  });

  if ($("#inv-stat-count")) $("#inv-stat-count").textContent = count;
  if ($("#inv-stat-revenue"))
    $("#inv-stat-revenue").textContent = fmtCurrency(revenue);
  if ($("#inv-stat-top"))
    $("#inv-stat-top").textContent =
      topQty > 0 ? `${topName} (×${topQty})` : "—";
}

function renderInvoicesTable() {
  const tbody = $("#invoices-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  populateEmployeeFilter();

  const search = ($("#invoice-search")?.value || "").toLowerCase();
  const empFilter = $("#invoice-filter-employee")?.value || "";
  const docFilter = $("#invoice-filter-doctype")?.value || "";
  const fromStr = $("#invoice-filter-from")?.value || "";
  const toStr = $("#invoice-filter-to")?.value || "";
  const fromTime = fromStr ? new Date(fromStr + "T00:00:00").getTime() : null;
  const toTime = toStr ? new Date(toStr + "T23:59:59").getTime() : null;

  // Today range when in "today only" mode
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const filtered = invoices.filter((i) => {
    // Today-only mode: skip anything not from today
    if (!invoicesShowAll) {
      const t = new Date(i.date).getTime();
      if (t < todayStart.getTime() || t > todayEnd.getTime()) return false;
    }
    if (empFilter && i.soldBy !== empFilter) return false;
    if (docFilter && (i.docType || "invoice") !== docFilter) return false;
    if (fromTime !== null || toTime !== null) {
      const t = new Date(i.date).getTime();
      if (fromTime !== null && t < fromTime) return false;
      if (toTime !== null && t > toTime) return false;
    }
    if (search) {
      const cust = customers.find((c) => c.id === i.customer);
      const matches =
        i.id.toLowerCase().includes(search) ||
        (cust && cust.name.toLowerCase().includes(search)) ||
        (i.soldBy && String(i.soldBy).toLowerCase().includes(search)) ||
        (i.items || []).some(
          (it) =>
            (it.name && it.name.toLowerCase().includes(search)) ||
            (it.sku && it.sku.toLowerCase().includes(search)) ||
            (it.serialNo && String(it.serialNo).toLowerCase().includes(search)),
        );
      if (!matches) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    const emptyMsg = invoicesShowAll
      ? "No invoices found"
      : "No invoices today yet";
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--muted);"><i class="fas fa-inbox" style="font-size:24px; display:block; margin-bottom:8px; opacity:0.4;"></i>${emptyMsg}</td></tr>`;
    return;
  }

  [...filtered].reverse().forEach((i) => {
    const customer = customers.find((c) => c.id === i.customer);
    const isReceipt = i.docType === "receipt";
    const itemCount = (i.items || []).length;
    const isCredit = i.paymentMethod === "credit";
    const isAdvance = i.paymentMethod === "advance";
    const creditBadge = isCredit
      ? `<span class="inv-credit-badge credit-${i.creditStatus || "unpaid"}">
           <i class="fas ${i.creditStatus === "paid" ? "fa-check" : i.creditStatus === "partial" ? "fa-clock" : "fa-exclamation-circle"}"></i>
           ${i.creditStatus === "paid" ? "Credit · Paid" : i.creditStatus === "partial" ? "Credit · Partial" : "Credit · Unpaid"}
         </span>`
      : isAdvance
      ? `<span class="inv-credit-badge credit-${i.creditStatus || "partial"}" style="background:#fef08a;color:#713f12;border-color:#ca8a04;">
           <i class="fas ${i.creditStatus === "paid" ? "fa-check" : "fa-hand-holding-heart"}"></i>
           ${i.creditStatus === "paid" ? "Advance · Paid" : i.creditStatus === "partial" ? "Advance · Partial" : "Advance · Pending"}
         </span>`
      : "";
    const isReturnDoc  = i.docType === "return";
    const isReturned   = i.status === "returned";
    const isPartialRet = i.status === "partial-return";
    const returnedBadge = isReturned
      ? `<span class="inv-returned-badge"><i class="fas fa-rotate-left"></i> Returned</span>`
      : isPartialRet
        ? `<span class="inv-returned-badge"><i class="fas fa-rotate-left"></i> Partial Return</span>`
        : isReturnDoc
          ? `<span class="inv-returned-badge"><i class="fas fa-rotate-left"></i> Return</span>`
          : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="inv-id-cell">
          <div class="inv-icon ${isReceipt ? "inv-icon-receipt" : "inv-icon-invoice"}">
            <i class="fas ${isReceipt ? "fa-receipt" : "fa-file-invoice"}"></i>
          </div>
          <div class="inv-id-wrap">
            <div class="inv-id">${escapeHtml(i.id)}</div>
            <div class="inv-sub">
              <span class="inv-type-badge ${isReturnDoc ? "type-receipt" : isReceipt ? "type-receipt" : "type-invoice"}">${isReturnDoc ? "Return" : isReceipt ? "Receipt" : "Invoice"}</span>
              <span class="inv-items">· ${itemCount} ${itemCount === 1 ? "item" : "items"}</span>
              ${creditBadge}${returnedBadge}
            </div>
          </div>
        </div>
      </td>
      <td class="hide-mobile">
        <span class="inv-date">${formatDate(i.date)}</span>
      </td>
      <td class="hide-sm">
        <span class="inv-customer">${customer ? escapeHtml(customer.name) : '<span class="inv-walkin"><i class="fas fa-user-slash"></i> Walk-in</span>'}</span>
      </td>
      <td class="hide-sm">
        <span class="inv-soldby">${escapeHtml(i.soldBy || "—")}</span>
      </td>
      <td>
        <span class="inv-total">${fmtCurrency(i.total)}</span>
      </td>
      <td class="inv-actions">
        <button class="inv-btn inv-btn-view view-invoice" data-id="${i.id}" title="View">
          <i class="fas fa-eye"></i><span>View</span>
        </button>
        ${!isReturnDoc ? `
        <button class="inv-btn inv-btn-resend resend-invoice" data-id="${i.id}" title="Resend via WhatsApp">
          <i class="fa-brands fa-whatsapp"></i><span>Resend</span>
        </button>
        <button class="inv-btn inv-btn-return return-invoice" data-id="${i.id}" title="Return / Refund"
          ${isReturned ? 'disabled' : ''}>
          <i class="fas fa-rotate-left"></i><span>Return</span>
        </button>` : ""}
        <button class="inv-btn inv-btn-delete delete-invoice" data-id="${i.id}" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  qsa(".view-invoice").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const inv = invoices.find((i) => i.id === e.currentTarget.dataset.id);
      if (inv) showInvoiceModal(inv);
    });
  });

  qsa(".resend-invoice").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      const inv = invoices.find((i) => i.id === id);
      if (inv) resendInvoiceWhatsApp(inv, e.currentTarget);
    });
  });

  qsa(".return-invoice").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      const inv = invoices.find((i) => i.id === id);
      if (inv) openReturnModal(inv);
    });
  });

  qsa(".delete-invoice").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm("Delete this invoice?")) {
        invoices = invoices.filter((i) => i.id !== id);
        saveAllData();
        renderInvoicesTable();
        updateDashboard();
      }
    });
  });
}

// ── EMAIL INVOICE ──────────────────────────────────────────────
async function sendInvoiceEmail() {
  const inv = _currentModalInvoice;
  if (!inv) return;

  const customer = customers.find((c) => c.id === inv.customer);
  const defaultEmail = customer?.email || "";
  const toEmail = prompt("Send invoice PDF to email address:", defaultEmail);
  if (!toEmail || !toEmail.includes("@")) return;

  const btn = $("#btn-send-invoice-email");
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  try {
    const html = buildDocumentHTML(inv);
    const docLabel = inv.docType === "return" ? "Return" : inv.docType === "receipt" ? "Receipt" : "Invoice";
    const filename = `${docLabel}-${inv.id}.pdf`;

    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: toEmail,
        subject: `${docLabel} ${inv.id} from ${(window.APP_CONFIG?.businessName) || "SD Computers"}`,
        html,
        filename,
        invoiceId: inv.id,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      showAppToast(`✅ ${docLabel} emailed to ${toEmail}`, "#16a34a");
    } else {
      alert("❌ Email failed: " + (data.error || "Unknown error"));
    }
  } catch (e) {
    alert("❌ Email error: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📧 Email"; }
  }
}

// ── RETURN / REFUND ──────────────────────────────────────────
let _returnInvoice = null;
let _rtnPreviewHTML = "";

function printRtnPreview() {
  if (!_rtnPreviewHTML) return;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { showAppToast("Pop-up blocked — please allow pop-ups for printing", "#f59e0b"); return; }
  w.document.write(_rtnPreviewHTML);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

function openReturnModal(invoice) {
  _returnInvoice = invoice;
  const customer = customers.find((c) => c.id === invoice.customer);
  const custName  = customer ? customer.name : "Walk-in";

  // Info bar
  const info = $("#return-modal-info");
  if (info) {
    const payBadge = invoice.paymentMethod === "credit"
      ? `<span class="cret-info-badge cret-badge-credit"><i class="fa fa-file-invoice"></i> Credit</span>`
      : `<span class="cret-info-badge cret-badge-cash"><i class="fa fa-money-bill-wave"></i> ${(invoice.paymentMethod || "cash").charAt(0).toUpperCase() + (invoice.paymentMethod || "cash").slice(1)}</span>`;
    info.innerHTML = `
      <div class="cret-info-row">
        <div class="cret-info-icon"><i class="fa fa-user"></i></div>
        <div class="cret-info-text">
          <div class="cret-info-name">${escapeHtml(custName)}</div>
          <div class="cret-info-meta">
            <span>${escapeHtml(invoice.id)}</span>
            <span class="cret-dot">·</span>
            <span>${formatDate(invoice.date)}</span>
            <span class="cret-dot">·</span>
            <span class="cret-info-total">${fmtCurrency(invoice.total)}</span>
          </div>
        </div>
        <div>${payBadge}</div>
      </div>`;
  }

  // Items list
  const list = $("#return-items-list");
  if (list) {
    list.innerHTML = (invoice.items || []).map((item, idx) => `
      <label class="cret-item-card" for="cret-chk-${idx}">
        <input type="checkbox" class="return-item-check cret-chk" id="cret-chk-${idx}" data-idx="${idx}" checked />
        <div class="cret-item-info">
          <div class="cret-item-name">${escapeHtml(item.name || "")}</div>
          ${item.sku ? `<div class="cret-item-sku">${escapeHtml(item.sku)}</div>` : ""}
        </div>
        <div class="cret-qty-wrap">
          <span class="cret-qty-label">Qty</span>
          <input type="number" class="return-qty-input cret-qty-input" data-idx="${idx}"
            value="${item.qty}" min="1" max="${item.qty}" onclick="event.stopPropagation()" />
          <span class="cret-qty-max">/ ${item.qty}</span>
        </div>
        <div class="cret-item-price">${fmtCurrency(item.lineTotal || item.price * item.qty)}</div>
      </label>
    `).join("");

    list.addEventListener("change", updateReturnPreview);
    list.addEventListener("input",  updateReturnPreview);
  }

  const reasonEl = $("#return-reason");
  if (reasonEl) reasonEl.value = "";

  const preview = $("#return-total-preview");
  if (preview) preview.classList.add("hidden");

  updateReturnPreview();
  $("#return-modal")?.classList.remove("hidden");
}

function updateReturnPreview() {
  if (!_returnInvoice) return;
  let total = 0;
  let checkedCount = 0;
  qsa(".return-item-check").forEach((chk) => {
    const card = chk.closest(".cret-item-card");
    if (card) card.classList.toggle("cret-item-unchecked", !chk.checked);
    if (!chk.checked) return;
    checkedCount++;
    const idx = parseInt(chk.dataset.idx);
    const item = _returnInvoice.items[idx];
    const qtyInput = document.querySelector(`.return-qty-input[data-idx="${idx}"]`);
    const qty = Math.min(Math.max(1, parseInt(qtyInput?.value) || 1), item.qty);
    const ratio = qty / item.qty;
    total += (item.lineTotal || item.price * item.qty) * ratio;
  });
  // Apply same overall discount ratio from original invoice
  const origSubtotal = _returnInvoice.items.reduce((s, i) => s + (i.lineTotal || i.price * i.qty), 0);
  const discountRatio = origSubtotal > 0 ? _returnInvoice.total / origSubtotal : 1;
  const refund = total * discountRatio;
  const preview = $("#return-total-preview");
  if (preview) {
    if (checkedCount > 0) {
      preview.classList.remove("hidden");
      preview.innerHTML = `
        <div>
          <div class="cret-summary-label">REFUND AMOUNT</div>
          <div class="cret-summary-amount">${fmtCurrency(refund)}</div>
        </div>
        <div class="cret-summary-note"><i class="fa fa-boxes"></i> ${checkedCount} item type(s) selected · Stock will be restored</div>`;
    } else {
      preview.classList.add("hidden");
    }
  }
}

function closeReturnModal() {
  $("#return-modal")?.classList.add("hidden");
  _returnInvoice = null;
}

function processReturn() {
  const invoice = _returnInvoice;
  if (!invoice) return;

  const reason = ($("#return-reason")?.value || "").trim();
  if (!reason) {
    alert("Please enter a reason for the return.");
    return;
  }

  // Collect selected items + quantities
  const returnedItems = [];
  qsa(".return-item-check").forEach((chk) => {
    if (!chk.checked) return;
    const idx = parseInt(chk.dataset.idx);
    const orig = invoice.items[idx];
    const qtyInput = document.querySelector(`.return-qty-input[data-idx="${idx}"]`);
    const qty = Math.min(Math.max(1, parseInt(qtyInput?.value) || 1), orig.qty);
    const ratio = qty / orig.qty;
    returnedItems.push({
      ...orig,
      qty,
      lineTotal: (orig.lineTotal || orig.price * orig.qty) * ratio,
    });
  });

  if (returnedItems.length === 0) {
    alert("Please select at least one item to return.");
    return;
  }

  // Restore stock for each returned item
  returnedItems.forEach((ri) => {
    const p = products.find((x) => x.id === ri.id);
    if (p) p.stock = (Number(p.stock) || 0) + ri.qty;
  });

  // Calculate refund amount (proportional to original total)
  const origSubtotal = invoice.items.reduce((s, i) => s + (i.lineTotal || i.price * i.qty), 0);
  const retSubtotal  = returnedItems.reduce((s, i) => s + (i.lineTotal || 0), 0);
  const ratio = origSubtotal > 0 ? retSubtotal / origSubtotal : 1;
  const refundAmount = invoice.total * ratio;

  // Generate RTN-XXXX id
  const existingNums = invoices.map((i) => {
    const m = i.id && i.id.match(/^RTN-(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  });
  const nextNum = (existingNums.length ? Math.max(...existingNums) : 0) + 1;
  const returnId = `RTN-${String(nextNum).padStart(4, "0")}`;

  // Create the return record
  invoices.push({
    id: returnId,
    docType: "return",
    refInvoiceId: invoice.id,
    date: timestamp(),
    customer: invoice.customer,
    items: returnedItems,
    subtotal: retSubtotal,
    total: -refundAmount,
    reason,
    paymentMethod: invoice.paymentMethod,
    status: "completed",
    soldBy: currentUser || "unknown",
  });

  // Check full vs partial return
  const isFullReturn = returnedItems.length === invoice.items.length &&
    returnedItems.every((ri) => {
      const orig = invoice.items.find((x) => x.id === ri.id);
      return orig && ri.qty >= orig.qty;
    });

  // Mark original invoice
  const orig = invoices.find((i) => i.id === invoice.id);
  if (orig) {
    orig.returnId = returnId;
    orig.status   = isFullReturn ? "returned" : "partial-return";
  }

  // Reduce credit balance if credit invoice
  if (orig && invoice.paymentMethod === "credit" && (invoice.creditAmount || 0) > 0) {
    orig.creditAmount = Math.max(0, (invoice.creditAmount || 0) - invoice.creditAmount * ratio);
    if (orig.creditAmount <= 0.001) orig.creditStatus = "paid";
  }

  // Deduct loyalty points earned on this invoice proportionally
  if (invoice.loyaltyEarnedPts && invoice.customer) {
    const cust = customers.find((c) => c.id === invoice.customer);
    if (cust) {
      const deduct = Math.floor((invoice.loyaltyEarnedPts || 0) * ratio);
      cust.loyaltyPoints = Math.max(0, (Number(cust.loyaltyPoints) || 0) - deduct);
    }
  }

  // Save to Returns & Refunds section
  const custName = invoice.customer
    ? (customers.find((c) => c.id === invoice.customer)?.name || invoice.customer)
    : "Walk-in";
  returns.push({
    id: generateReturnId(),
    type: "customer",
    date: new Date().toISOString(),
    referenceId: invoice.id,
    customerName: custName,
    customerId: invoice.customer || "",
    supplierName: "",
    supplierId: "",
    items: returnedItems.map((ri) => ({
      productId: ri.id || "",
      name: ri.name || "",
      qty: ri.qty,
      unitPrice: ri.price || 0,
      total: ri.lineTotal || 0,
    })),
    reason,
    refundMethod: "cash",
    totalAmount: refundAmount,
    notes: "",
  });

  saveAllData();
  closeReturnModal();
  renderInvoicesTable();
  updateDashboard();

  // Build the return record object for the PDF
  const returnRecord = {
    id: returnId,
    docType: "return",
    refInvoiceId: invoice.id,
    date: new Date().toISOString(),
    customer: invoice.customer,
    items: returnedItems,
    subtotal: retSubtotal,
    total: -refundAmount,
    reason,
    paymentMethod: invoice.paymentMethod,
    soldBy: currentUser || "unknown",
  };

  showAppToast(
    `✅ ${returnId} processed — ${isFullReturn ? "Full return" : "Partial return"}, stock restored`,
    "#f97316",
  );

  // Auto-send WhatsApp return receipt to customer
  const custObj = customers.find((c) => c.id === invoice.customer);
  if (custObj && custObj.phone) {
    (async () => {
      try {
        const html = buildReturnHTML(returnRecord);
        await fetch("/api/whatsapp/send-invoice-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: custObj.phone,
            html,
            invoiceId: returnId,
            invoice: returnRecord,
            customerName: custObj.name,
          }),
        });
        showAppToast(`📱 Return receipt sent to ${custObj.name} via WhatsApp`, "#10b981");
      } catch { /* silent */ }
    })();
  }
}

async function resendInvoiceWhatsApp(invoice, btn) {
  const docLabel = invoice.docType === "receipt" ? "Receipt" : "Invoice";
  const customer = customers.find((c) => c.id === invoice.customer);

  if (!customer) {
    alert("⚠️ This invoice has no linked customer (Walk-in). Cannot resend.");
    return;
  }
  if (!customer.phone) {
    alert(
      `⚠️ Customer "${customer.name}" has no phone number saved. Add a phone number first.`,
    );
    return;
  }
  if (
    !confirm(
      `Resend ${docLabel} ${invoice.id} to ${customer.name} (${customer.phone}) via WhatsApp?`,
    )
  )
    return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Sending…</span>';

  try {
    const html = buildDocumentHTML(invoice);
    const res = await fetch("/api/whatsapp/send-invoice-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: customer.phone,
        html,
        invoiceId: invoice.id,
        invoice,
        customerName: customer.name,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      showAppToast(`✅ ${docLabel} resent to ${customer.name}!`, "#16a34a");
    } else {
      showAppToast(
        `⚠️ Resend failed: ${data.error || res.statusText}`,
        "#dc2626",
      );
    }
  } catch (err) {
    showAppToast(`⚠️ Resend error: ${err.message}`, "#dc2626");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ==================== MODALS ====================
let editingProductId = null;
let editingCustomerId = null;

function populateCategorySelect() {
  const sel = $("#p-category");
  if (!sel) return;
  sel.innerHTML = "";
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });
}

function openAddProductModal() {
  editingProductId = null;
  populateCategorySelect();
  $("#modal-title").textContent = "Add Product";
  if ($("#p-id")) $("#p-id").value = "";
  if ($("#p-sku")) $("#p-sku").value = genProductCode();
  if ($("#p-name")) $("#p-name").value = "";
  if ($("#p-price")) $("#p-price").value = "";
  if ($("#p-cost")) $("#p-cost").value = "";
  if ($("#p-wholesale")) $("#p-wholesale").value = "";
  if ($("#p-best")) $("#p-best").value = "";
  if ($("#p-stock")) $("#p-stock").value = "";
  if ($("#p-low")) $("#p-low").value = "";
  if ($("#p-barcode")) $("#p-barcode").value = "";
  if ($("#p-warranty")) $("#p-warranty").value = "";
  if ($("#p-category")) $("#p-category").value = categories[0] || "General";
  $("#modal")?.classList.remove("hidden");
}

function openEditProductModal(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  editingProductId = id;
  populateCategorySelect();
  $("#modal-title").textContent = "Edit Product";
  if ($("#p-id")) $("#p-id").value = id;
  if ($("#p-sku")) $("#p-sku").value = p.sku;
  if ($("#p-name")) $("#p-name").value = p.name;
  if ($("#p-price")) $("#p-price").value = p.price;
  if ($("#p-stock")) $("#p-stock").value = p.stock;
  if ($("#p-category")) $("#p-category").value = p.category;
  if ($("#p-cost")) $("#p-cost").value = p.costPrice ?? "";
  if ($("#p-wholesale")) $("#p-wholesale").value = p.wholesalePrice ?? "";
  if ($("#p-best")) $("#p-best").value = p.bestPrice ?? "";
  if ($("#p-low")) $("#p-low").value = p.lowStockAlert ?? "";
  if ($("#p-barcode")) $("#p-barcode").value = p.barcode ?? "";
  if ($("#p-warranty")) $("#p-warranty").value = p.warrantyMonths ?? "";
  $("#modal")?.classList.remove("hidden");
}

function closeModal() {
  $("#modal")?.classList.add("hidden");
  editingProductId = null;
}

function saveProduct() {
  const name = $("#p-name")?.value.trim();
  const sku = $("#p-sku")?.value.trim();
  const price = Number($("#p-price")?.value) || 0;
  const stock = Number($("#p-stock")?.value) || 0;
  const category = $("#p-category")?.value || "General";
  const costPrice = $("#p-cost")?.value !== "" ? Number($("#p-cost").value) || 0 : undefined;
  const wholesalePrice = $("#p-wholesale")?.value !== "" ? Number($("#p-wholesale").value) || 0 : undefined;
  const bestPrice = $("#p-best")?.value !== "" ? Number($("#p-best").value) || 0 : undefined;
  const lowStockAlertRaw = $("#p-low")?.value;
  const lowStockAlert = lowStockAlertRaw !== "" && lowStockAlertRaw != null ? Number(lowStockAlertRaw) : undefined;
  const barcode = $("#p-barcode")?.value.trim() || undefined;
  const warrantyMonthsRaw = $("#p-warranty")?.value;
  const warrantyMonths = warrantyMonthsRaw !== "" && warrantyMonthsRaw != null ? Number(warrantyMonthsRaw) : undefined;

  if (!name || !sku) {
    alert("Name and SKU are required");
    return;
  }

  if (editingProductId) {
    const p = products.find((x) => x.id === editingProductId);
    if (p) {
      p.sku = sku;
      p.name = name;
      p.price = price;
      p.stock = stock;
      p.category = category;
      if (costPrice !== undefined) p.costPrice = costPrice; else delete p.costPrice;
      if (wholesalePrice !== undefined) p.wholesalePrice = wholesalePrice; else delete p.wholesalePrice;
      if (bestPrice !== undefined) p.bestPrice = bestPrice; else delete p.bestPrice;
      if (lowStockAlert !== undefined && !Number.isNaN(lowStockAlert)) p.lowStockAlert = lowStockAlert; else delete p.lowStockAlert;
      if (barcode) p.barcode = barcode; else delete p.barcode;
      if (warrantyMonths !== undefined && !Number.isNaN(warrantyMonths)) p.warrantyMonths = warrantyMonths; else delete p.warrantyMonths;
    }
  } else {
    const newP = {
      id: genId(),
      sku,
      name,
      price,
      stock,
      category,
      code: sku,
    };
    if (costPrice !== undefined) newP.costPrice = costPrice;
    if (wholesalePrice !== undefined) newP.wholesalePrice = wholesalePrice;
    if (bestPrice !== undefined) newP.bestPrice = bestPrice;
    if (lowStockAlert !== undefined && !Number.isNaN(lowStockAlert)) newP.lowStockAlert = lowStockAlert;
    if (barcode) newP.barcode = barcode;
    if (warrantyMonths !== undefined && !Number.isNaN(warrantyMonths)) newP.warrantyMonths = warrantyMonths;
    products.push(newP);
  }
  saveAllData();
  closeModal();
  renderProductsTable();
  updateDashboard();
}

function openAddCustomerModal() {
  editingCustomerId = null;
  $("#customer-modal-title").textContent = "Add Customer";
  if ($("#c-name")) $("#c-name").value = "";
  if ($("#c-email")) $("#c-email").value = "";
  if ($("#c-phone")) $("#c-phone").value = "";
  if ($("#c-birthday")) $("#c-birthday").value = "";
  if ($("#c-tags")) $("#c-tags").value = "";
  if ($("#c-address")) $("#c-address").value = "";
  $("#customer-modal")?.classList.remove("hidden");
}

function openEditCustomerModal(id) {
  const c = customers.find((x) => x.id === id);
  if (!c) return;
  editingCustomerId = id;
  $("#customer-modal-title").textContent = "Edit Customer";
  if ($("#c-name")) $("#c-name").value = c.name;
  if ($("#c-email")) $("#c-email").value = c.email || "";
  if ($("#c-phone")) $("#c-phone").value = c.phone || "";
  if ($("#c-birthday")) $("#c-birthday").value = c.birthday || "";
  if ($("#c-tags")) $("#c-tags").value = (c.tags || []).join(", ");
  if ($("#c-address")) $("#c-address").value = c.address || "";
  $("#customer-modal")?.classList.remove("hidden");
}

function closeCustomerModal() {
  $("#customer-modal")?.classList.add("hidden");
  editingCustomerId = null;
}

function openCustomerInfoModal(id) {
  const c = customers.find((x) => x.id === id);
  if (!c) return;
  const modal = $("#customer-info-modal");
  if (!modal) return;

  const avatarColors = [
    "#6366f1",
    "#8b5cf6",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
    "#3b82f6",
    "#ef4444",
    "#14b8a6",
    "#f97316",
  ];
  let h = 0;
  for (let i = 0; i < (c.name || "?").length; i++)
    h = (h * 31 + c.name.charCodeAt(i)) >>> 0;
  const color = avatarColors[h % avatarColors.length];
  const initial = (c.name || "?").trim().charAt(0).toUpperCase();

  const purchaseCount = invoices.filter((i) => i.customer === c.id).length;
  const totalPurchases = invoices
    .filter((i) => i.customer === c.id)
    .reduce((s, i) => s + i.total, 0);

  $("#ci-avatar").style.background = color;
  $("#ci-avatar").textContent = initial;
  $("#ci-name").textContent = c.name;
  $("#ci-sub").textContent =
    `${purchaseCount} ${purchaseCount === 1 ? "order" : "orders"} • ${fmtCurrency(totalPurchases)}`;

  $("#ci-email").textContent = c.email || "—";
  $("#ci-email").classList.toggle("ci-empty", !c.email);
  $("#ci-phone").textContent = c.phone || "—";
  $("#ci-phone").classList.toggle("ci-empty", !c.phone);
  $("#ci-address").textContent = c.address || "—";
  $("#ci-address").classList.toggle("ci-empty", !c.address);

  const tagsWrap = $("#ci-tags");
  tagsWrap.innerHTML =
    c.tags && c.tags.length
      ? c.tags
          .map((t) => `<span class="cust-tag">${escapeHtml(t)}</span>`)
          .join("")
      : '<span class="cust-empty">No tags</span>';

  // Quick action buttons
  const callBtn = $("#ci-call-btn");
  const mailBtn = $("#ci-mail-btn");
  const waBtn = $("#ci-wa-btn");
  if (callBtn) {
    callBtn.disabled = !c.phone;
    callBtn.onclick = () =>
      c.phone && (window.location.href = `tel:${c.phone}`);
  }
  if (mailBtn) {
    mailBtn.disabled = !c.email;
    mailBtn.onclick = () =>
      c.email && (window.location.href = `mailto:${c.email}`);
  }
  if (waBtn) {
    waBtn.disabled = !c.phone;
    waBtn.onclick = () => {
      closeCustomerInfoModal();
      openWAMessageModal(c.id);
    };
  }

  // Credit banner
  const creditBanner = $("#ci-credit-banner");
  if (creditBanner) {
    const openInvs = getOpenCreditInvoicesForCustomer(c.id);
    const totalOutstanding = openInvs.reduce(
      (s, i) => s + (i.creditAmount || 0),
      0,
    );
    if (totalOutstanding > 0.001) {
      creditBanner.classList.remove("hidden");
      $("#ci-credit-amount").textContent = fmtCurrency(totalOutstanding);
      $("#ci-credit-count").textContent = `${openInvs.length} open ${openInvs.length === 1 ? "invoice" : "invoices"}`;
      const payBtn = $("#ci-pay-credit-btn");
      if (payBtn) {
        payBtn.onclick = () => {
          closeCustomerInfoModal();
          openRecordPaymentModal(c.id);
        };
      }
    } else {
      creditBanner.classList.add("hidden");
    }
  }

  // Loyalty banner
  const loyBanner = $("#ci-loyalty-banner");
  if (loyBanner) {
    const loyCfg = getLoyaltyConfig();
    const points = Number(c.loyaltyPoints) || 0;
    if (loyCfg.enabled && points > 0) {
      loyBanner.classList.remove("hidden");
      $("#ci-loyalty-points").textContent = points + " pts";
      const cashValue = Math.floor(points / 100) * (Number(loyCfg.redeemRate) || 50);
      $("#ci-loyalty-cash").textContent = `≈ ${fmtCurrency(cashValue)} cash value`;
    } else {
      loyBanner.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
}

function closeCustomerInfoModal() {
  $("#customer-info-modal")?.classList.add("hidden");
}

// ==================== CREDIT SYSTEM ====================

function toggleCreditDetails(method) {
  const panel = $("#credit-details");
  const advPanel = $("#advance-details");
  if (panel) {
    if (method === "credit") {
      panel.classList.remove("hidden");
      updateCreditBalanceDisplay();
    } else {
      panel.classList.add("hidden");
    }
  }
  if (advPanel) {
    if (method === "advance") {
      advPanel.classList.remove("hidden");
      updateAdvanceBalanceDisplay();
    } else {
      advPanel.classList.add("hidden");
    }
  }
}

function updateAdvanceBalanceDisplay() {
  const totalEl = $("#grand-total");
  const total = totalEl ? Number(totalEl.textContent.replace(/[^\d.-]/g, "")) || 0 : 0;
  const advPaid = Math.max(0, Math.min(total, Number($("#advance-paid-now")?.value) || 0));
  const balance = Math.max(0, total - advPaid);
  const disp = $("#advance-balance-display");
  if (disp) disp.textContent = fmtCurrency(balance);
}

function updateCreditBalanceDisplay() {
  const totalEl = $("#grand-total");
  const total = totalEl ? Number(totalEl.textContent.replace(/[^\d.-]/g, "")) || 0 : 0;
  const paidNow = Math.max(
    0,
    Math.min(total, Number($("#credit-paid-now")?.value) || 0),
  );
  const balance = Math.max(0, total - paidNow);
  const disp = $("#credit-balance-display");
  if (disp) disp.textContent = fmtCurrency(balance);
}

function getOpenCreditInvoicesForCustomer(customerId) {
  return invoices
    .filter(
      (i) =>
        i.customer === customerId &&
        i.paymentMethod === "credit" &&
        (i.creditAmount || 0) > 0.001,
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getAllCreditInvoicesForCustomer(customerId) {
  return invoices
    .filter((i) => i.customer === customerId && i.paymentMethod === "credit")
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderCreditView() {
  const tbody = $("#credit-customers-tbody");
  if (!tbody) return;

  const search = ($("#credit-search")?.value || "").toLowerCase().trim();
  const statusFilter = $("#credit-filter-status")?.value || "open";

  // Aggregate credit per customer
  const creditByCustomer = {};
  invoices.forEach((inv) => {
    if (inv.paymentMethod !== "credit") return;
    if (!inv.customer) return;
    if (!creditByCustomer[inv.customer]) {
      creditByCustomer[inv.customer] = {
        customerId: inv.customer,
        outstanding: 0,
        collected: 0,
        totalCredit: 0,
        openInvoices: [],
        allInvoices: [],
        oldestUnpaid: null,
      };
    }
    const bucket = creditByCustomer[inv.customer];
    bucket.totalCredit += inv.total || 0;
    bucket.collected += inv.paidAmount || 0;
    bucket.outstanding += inv.creditAmount || 0;
    bucket.allInvoices.push(inv);
    if ((inv.creditAmount || 0) > 0.001) {
      bucket.openInvoices.push(inv);
      const d = new Date(inv.date);
      if (!bucket.oldestUnpaid || d < bucket.oldestUnpaid) {
        bucket.oldestUnpaid = d;
      }
    }
  });

  // Stats
  let totalOutstanding = 0;
  let totalCollected = 0;
  let openInvoiceCount = 0;
  let customersWithCredit = 0;
  Object.values(creditByCustomer).forEach((b) => {
    totalOutstanding += b.outstanding;
    totalCollected += b.collected;
    openInvoiceCount += b.openInvoices.length;
    if (b.outstanding > 0.001) customersWithCredit++;
  });

  const setText = (id, val) => {
    const el = $(id);
    if (el) el.textContent = val;
  };
  setText("#credit-stat-outstanding", fmtCurrency(totalOutstanding));
  setText("#credit-stat-collected", fmtCurrency(totalCollected));
  setText("#credit-stat-customers", String(customersWithCredit));
  setText("#credit-stat-invoices", String(openInvoiceCount));

  // Filter & sort
  let rows = Object.values(creditByCustomer);
  if (statusFilter === "open") {
    rows = rows.filter((b) => b.outstanding > 0.001);
  }
  if (search) {
    rows = rows.filter((b) => {
      const c = customers.find((cu) => cu.id === b.customerId);
      if (!c) return false;
      return (
        c.name.toLowerCase().includes(search) ||
        (c.phone && c.phone.toLowerCase().includes(search))
      );
    });
  }
  rows.sort((a, b) => b.outstanding - a.outstanding);

  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px 20px; color:var(--muted);">
      <i class="fas fa-check-circle" style="font-size:32px; display:block; margin-bottom:12px; opacity:0.4; color:#10b981;"></i>
      No customers with outstanding credit
    </td></tr>`;
    return;
  }

  const avatarColors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
    "#06b6d4", "#3b82f6", "#ef4444", "#14b8a6", "#f97316",
  ];
  const pickColor = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return avatarColors[h % avatarColors.length];
  };

  const now = new Date();
  rows.forEach((b) => {
    const c = customers.find((cu) => cu.id === b.customerId);
    if (!c) return;
    const initial = (c.name || "?").trim().charAt(0).toUpperCase();
    const color = pickColor(c.name || "?");
    const oldest = b.oldestUnpaid;
    const daysOld = oldest
      ? Math.floor((now - oldest) / (1000 * 60 * 60 * 24))
      : 0;
    const ageBadge = !oldest
      ? '<span class="credit-age-badge credit-age-paid"><i class="fas fa-check"></i> All paid</span>'
      : daysOld <= 7
      ? `<span class="credit-age-badge credit-age-recent">${daysOld}d ago</span>`
      : daysOld <= 30
      ? `<span class="credit-age-badge credit-age-medium">${daysOld}d ago</span>`
      : `<span class="credit-age-badge credit-age-old"><i class="fas fa-exclamation-triangle"></i> ${daysOld}d ago</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="cust-name-cell">
          <div class="cust-avatar" style="background:${color};">${escapeHtml(initial)}</div>
          <div class="cust-name-wrap">
            <div class="cust-name">${escapeHtml(c.name)}</div>
            <div class="cust-sub">${c.phone ? escapeHtml(c.phone) : "No phone"}</div>
          </div>
        </div>
      </td>
      <td class="hide-sm">
        <span class="credit-open-count">${b.openInvoices.length}</span>
        <span style="color:var(--muted); font-size:11px;"> / ${b.allInvoices.length} total</span>
      </td>
      <td class="hide-mobile">${ageBadge}</td>
      <td>
        <span class="credit-outstanding-amt ${b.outstanding > 0.001 ? "credit-amt-due" : "credit-amt-paid"}">
          ${fmtCurrency(b.outstanding)}
        </span>
      </td>
      <td class="inv-actions">
        <button class="inv-btn inv-btn-view view-credit-detail" data-id="${c.id}" title="View details">
          <i class="fas fa-eye"></i><span>View</span>
        </button>
        <button class="inv-btn inv-btn-pay record-credit-payment" data-id="${c.id}" title="Record payment"
          ${b.outstanding <= 0.001 ? "disabled" : ""}>
          <i class="fas fa-money-check-alt"></i><span>Record Payment</span>
        </button>
        ${
          c.phone
            ? `<button class="inv-btn inv-btn-resend remind-credit" data-id="${c.id}" title="Send WhatsApp reminder"
            ${b.outstanding <= 0.001 ? "disabled" : ""}>
            <i class="fa-brands fa-whatsapp"></i><span>Remind</span>
          </button>`
            : ""
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  qsa(".view-credit-detail").forEach((btn) =>
    btn.addEventListener("click", (e) =>
      openCustomerInfoModal(e.currentTarget.dataset.id),
    ),
  );
  qsa(".record-credit-payment").forEach((btn) =>
    btn.addEventListener("click", (e) =>
      openRecordPaymentModal(e.currentTarget.dataset.id),
    ),
  );
  qsa(".remind-credit").forEach((btn) =>
    btn.addEventListener("click", (e) =>
      sendCreditReminderWA(e.currentTarget.dataset.id),
    ),
  );
}

let _rpCustomerId = null;

function openRecordPaymentModal(customerId) {
  const c = customers.find((cu) => cu.id === customerId);
  if (!c) return;
  _rpCustomerId = customerId;

  const openInvs = getOpenCreditInvoicesForCustomer(customerId);
  const totalOutstanding = openInvs.reduce(
    (s, i) => s + (i.creditAmount || 0),
    0,
  );

  if (totalOutstanding <= 0.001) {
    alert("ℹ️ This customer has no outstanding credit.");
    return;
  }

  $("#rp-customer-name").textContent = c.name;
  $("#rp-customer-phone").textContent = c.phone || "";
  $("#rp-total-outstanding").textContent = fmtCurrency(totalOutstanding);
  $("#rp-invoice-count").textContent = String(openInvs.length);

  // Render the open invoices list
  const list = $("#rp-invoices-list");
  list.innerHTML = openInvs
    .map((inv) => {
      return `
      <div class="rp-invoice-item">
        <div class="rp-inv-id">
          <i class="fas fa-file-invoice"></i> ${escapeHtml(inv.id)}
          <span class="rp-inv-date">${formatDate(inv.date)}</span>
        </div>
        <div class="rp-inv-amounts">
          <span class="rp-inv-paid">Paid ${fmtCurrency(inv.paidAmount || 0)}</span>
          <span class="rp-inv-due">Due ${fmtCurrency(inv.creditAmount || 0)}</span>
        </div>
      </div>`;
    })
    .join("");

  $("#rp-amount").value = "";
  $("#rp-method").value = "cash";
  $("#rp-note").value = "";

  $("#record-payment-modal").classList.remove("hidden");
  setTimeout(() => $("#rp-amount")?.focus(), 50);
}

function closeRecordPaymentModal() {
  _rpCustomerId = null;
  $("#record-payment-modal")?.classList.add("hidden");
}

function applyRpQuickAmount(action) {
  if (!_rpCustomerId) return;
  const openInvs = getOpenCreditInvoicesForCustomer(_rpCustomerId);
  const total = openInvs.reduce((s, i) => s + (i.creditAmount || 0), 0);
  let amount = 0;
  if (action === "full") amount = total;
  else if (action === "half") amount = total / 2;
  else if (action === "oldest") amount = openInvs[0]?.creditAmount || 0;
  $("#rp-amount").value = amount.toFixed(2);
  updateRpPreview();
}

function updateRpPreview() {
  // No live preview row currently; reserved for future enhancements.
}

function submitRecordPayment() {
  if (!_rpCustomerId) return;
  const amount = Number($("#rp-amount")?.value) || 0;
  if (amount <= 0) {
    alert("Please enter a payment amount greater than 0.");
    return;
  }
  const method = $("#rp-method")?.value || "cash";
  const note = ($("#rp-note")?.value || "").trim();

  const openInvs = getOpenCreditInvoicesForCustomer(_rpCustomerId);
  const totalOutstanding = openInvs.reduce(
    (s, i) => s + (i.creditAmount || 0),
    0,
  );

  if (amount > totalOutstanding + 0.001) {
    if (
      !confirm(
        `Payment amount (${fmtCurrency(amount)}) is greater than the outstanding balance (${fmtCurrency(totalOutstanding)}). Apply only ${fmtCurrency(totalOutstanding)}?`,
      )
    ) {
      return;
    }
  }

  // Apply to oldest invoices first (FIFO)
  let remaining = Math.min(amount, totalOutstanding);
  const now = timestamp();
  const appliedTo = [];

  for (const inv of openInvs) {
    if (remaining <= 0.001) break;
    const due = inv.creditAmount || 0;
    const apply = Math.min(due, remaining);
    inv.paidAmount = (inv.paidAmount || 0) + apply;
    inv.creditAmount = Math.max(0, due - apply);
    inv.creditStatus = inv.creditAmount <= 0.001 ? "paid" : "partial";
    inv.payments = inv.payments || [];
    inv.payments.push({
      date: now,
      amount: apply,
      method,
      note,
      by: currentUser || "unknown",
    });
    appliedTo.push({ id: inv.id, amount: apply });
    remaining -= apply;
  }

  saveAllData();
  closeRecordPaymentModal();
  showAppToast(
    `✅ Payment of ${fmtCurrency(amount - remaining)} applied across ${appliedTo.length} ${appliedTo.length === 1 ? "invoice" : "invoices"}`,
    "#16a34a",
  );

  // Refresh views
  if ($("#view-credit")?.classList.contains("active")) renderCreditView();
  if ($("#view-invoices")?.classList.contains("active")) renderInvoicesTable();
  if ($("#view-customers")?.classList.contains("active")) renderCustomersTable();
}

function sendCreditReminderWA(customerId) {
  const c = customers.find((cu) => cu.id === customerId);
  if (!c || !c.phone) {
    alert("This customer has no phone number on file.");
    return;
  }
  const openInvs = getOpenCreditInvoicesForCustomer(customerId);
  const total = openInvs.reduce((s, i) => s + (i.creditAmount || 0), 0);
  if (total <= 0.001) {
    alert("No outstanding credit for this customer.");
    return;
  }

  const bizName = L("businessName", "") || L("appName", "Zyphra POS");
  const lines = openInvs
    .map(
      (i) =>
        `• ${i.id} (${formatDate(i.date)}): ${fmtCurrency(i.creditAmount || 0)}`,
    )
    .join("\n");
  const message =
    `Hello ${c.name},\n\n` +
    `This is a friendly reminder of your outstanding balance with ${bizName}:\n\n` +
    `${lines}\n\n` +
    `Total outstanding: ${fmtCurrency(total)}\n\n` +
    `Thank you for your prompt attention.`;

  fetch("/api/whatsapp/send-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: c.phone, message }),
  })
    .then((r) => r.json())
    .then((d) => {
      if (d.ok) {
        showAppToast("✅ Reminder sent via WhatsApp", "#16a34a");
      } else {
        showAppToast(`⚠️ WhatsApp send failed: ${d.error || "unknown"}`, "#dc2626");
      }
    })
    .catch((e) => {
      showAppToast(`⚠️ WhatsApp error: ${e.message}`, "#dc2626");
    });
}

// ==================== ADVANCE ORDERS ====================

let _advDeliveryInvoiceId = null;

async function renderAdvanceView() {
  const tbody = $("#adv-orders-tbody");
  if (!tbody) return;

  // Check WhatsApp connection status and show/hide warning
  let _advWaConnected = false;
  try {
    const waRes = await fetch("/api/whatsapp/status");
    const waData = await waRes.json();
    const waWarning = $("#adv-wa-warning");
    const remindAllBtn = $("#adv-remind-all-btn");
    _advWaConnected = waData.status === "connected";
    if (waWarning) {
      if (_advWaConnected) {
        waWarning.classList.add("hidden");
        waWarning.style.display = "none";
      } else {
        waWarning.classList.remove("hidden");
        waWarning.style.display = "flex";
      }
    }
    if (remindAllBtn) remindAllBtn.disabled = !_advWaConnected;
  } catch (_) {}

  const search = ($("#adv-search")?.value || "").toLowerCase().trim();
  const statusFilter = $("#adv-filter-status")?.value || "pending";

  let advInvoices = invoices.filter((i) => i.paymentMethod === "advance");

  // Stats
  const totalAdvPaid = advInvoices.reduce((s, i) => s + Number(i.paidAmount || 0), 0);
  const totalBalance = advInvoices.reduce((s, i) => s + Number(i.creditAmount || 0), 0);
  const pendingCount = advInvoices.filter((i) => (i.creditAmount || 0) > 0.001).length;
  const deliveredCount = advInvoices.filter((i) => (i.creditAmount || 0) <= 0.001).length;

  const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  setText("#adv-stat-paid", fmtCurrency(totalAdvPaid));
  setText("#adv-stat-balance", fmtCurrency(totalBalance));
  setText("#adv-stat-pending", String(pendingCount));
  setText("#adv-stat-delivered", String(deliveredCount));

  // Update nav badge
  const badge = $("#nav-advance-badge");
  if (badge) {
    if (pendingCount > 0) {
      badge.textContent = String(pendingCount);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  // Filter
  if (statusFilter === "pending") {
    advInvoices = advInvoices.filter((i) => (i.creditAmount || 0) > 0.001);
  }
  if (search) {
    advInvoices = advInvoices.filter((i) => {
      const c = customers.find((cu) => cu.id === i.customer);
      return (
        i.id.toLowerCase().includes(search) ||
        (c && c.name.toLowerCase().includes(search)) ||
        (c && c.phone && c.phone.toLowerCase().includes(search))
      );
    });
  }
  advInvoices.sort((a, b) => new Date(b.date) - new Date(a.date));

  tbody.innerHTML = "";
  if (advInvoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px 20px; color:var(--muted);">
      <i class="fas fa-hand-holding-heart" style="font-size:32px; display:block; margin-bottom:12px; opacity:0.4;"></i>
      No advance orders found
    </td></tr>`;
    return;
  }

  advInvoices.forEach((inv) => {
    const customer = customers.find((c) => c.id === inv.customer);
    const isPending = (inv.creditAmount || 0) > 0.001;
    const statusBadge = isPending
      ? `<span class="inv-credit-badge credit-partial" style="background:#fef08a;color:#713f12;border-color:#ca8a04;"><i class="fas fa-clock"></i> Pending</span>`
      : `<span class="inv-credit-badge credit-paid"><i class="fas fa-check"></i> Delivered</span>`;
    const itemCount = (inv.items || []).length;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="inv-id-cell">
          <div class="inv-icon inv-icon-invoice"><i class="fas fa-hand-holding-heart"></i></div>
          <div class="inv-id-wrap">
            <div class="inv-id">${escapeHtml(inv.id)}</div>
            <div class="inv-sub"><span class="inv-items">${itemCount} item${itemCount !== 1 ? "s" : ""}</span></div>
          </div>
        </div>
      </td>
      <td class="hide-mobile"><span class="inv-date">${formatDate(inv.date)}</span></td>
      <td class="hide-sm"><span class="inv-customer">${customer ? escapeHtml(customer.name) : '<span class="inv-walkin"><i class="fas fa-user-slash"></i> Walk-in</span>'}</span></td>
      <td><span style="color:#16a34a;font-weight:600;">${fmtCurrency(inv.paidAmount || 0)}</span></td>
      <td><span style="${isPending ? "color:#b45309;font-weight:700;" : "color:var(--muted);"}">${fmtCurrency(inv.creditAmount || 0)}</span></td>
      <td>${statusBadge}</td>
      <td class="inv-actions">
        <button class="inv-btn inv-btn-view adv-view-invoice" data-id="${escapeHtml(inv.id)}" title="View invoice">
          <i class="fas fa-eye"></i><span>View</span>
        </button>
        <button class="inv-btn inv-btn-pay adv-mark-delivered" data-id="${escapeHtml(inv.id)}" title="Mark as delivered"
          ${!isPending ? "disabled" : ""}>
          <i class="fas fa-truck"></i><span>Deliver</span>
        </button>
        <button class="inv-btn adv-wa-remind" data-id="${escapeHtml(inv.id)}" title="Send WhatsApp reminder"
          style="background:rgba(37,211,102,0.12);color:#25d366;border-color:rgba(37,211,102,0.3);"
          ${!isPending || !customer?.phone || !_advWaConnected ? "disabled" : ""}>
          <i class="fa-brands fa-whatsapp"></i><span>Remind</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".adv-view-invoice").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const inv = invoices.find((i) => i.id === e.currentTarget.dataset.id);
      if (inv) showInvoiceModal(inv);
    })
  );
  tbody.querySelectorAll(".adv-mark-delivered").forEach((btn) =>
    btn.addEventListener("click", (e) => openAdvanceDeliveryModal(e.currentTarget.dataset.id))
  );
  tbody.querySelectorAll(".adv-wa-remind").forEach((btn) =>
    btn.addEventListener("click", (e) => sendAdvanceWAReminder(e.currentTarget.dataset.id))
  );
}

function openAdvanceDeliveryModal(invoiceId) {
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!inv) return;
  _advDeliveryInvoiceId = invoiceId;

  const customer = customers.find((c) => c.id === inv.customer);

  $("#adv-del-inv-id").textContent = inv.id;
  $("#adv-del-customer-name").textContent = customer ? customer.name : "Walk-in";
  $("#adv-del-total").textContent = fmtCurrency(inv.total || 0);
  $("#adv-del-advance").textContent = fmtCurrency(inv.paidAmount || 0);
  $("#adv-del-balance").textContent = fmtCurrency(inv.creditAmount || 0);

  // Show items list
  const itemsList = $("#adv-del-items-list");
  if (itemsList) {
    itemsList.innerHTML = (inv.items || []).map((it) => `
      <div class="rp-invoice-item">
        <div class="rp-inv-id">
          <i class="fas fa-box"></i> ${escapeHtml(it.name)}
          ${it.serialNo ? `<span style="color:var(--muted); font-size:11px;"> · S/N: ${escapeHtml(it.serialNo)}</span>` : ""}
          ${it.warrantyMonths ? `<span style="color:#16a34a; font-size:11px;"> · ${it.warrantyMonths}mo warranty</span>` : ""}
        </div>
        <div class="rp-inv-amounts">
          <span class="rp-inv-paid">Qty: ${it.qty}</span>
          <span class="rp-inv-due">${fmtCurrency(it.lineTotal || 0)}</span>
        </div>
      </div>`).join("");
  }

  // Pre-fill balance amount
  const amtEl = $("#adv-del-amount");
  if (amtEl) amtEl.value = Number(inv.creditAmount || 0).toFixed(2);
  if ($("#adv-del-method")) $("#adv-del-method").value = "cash";
  if ($("#adv-del-note")) $("#adv-del-note").value = "";

  $("#adv-delivery-modal")?.classList.remove("hidden");
  setTimeout(() => $("#adv-del-amount")?.focus(), 50);
}

function closeAdvanceDeliveryModal() {
  _advDeliveryInvoiceId = null;
  $("#adv-delivery-modal")?.classList.add("hidden");
}

async function sendAdvanceWAReminder(invoiceId) {
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!inv) return false;
  const customer = customers.find((c) => c.id === inv.customer);
  if (!customer?.phone) {
    showAppToast("No phone number on file for this customer.", "#b45309");
    return false;
  }

  const storeName = appSettings?.businessName || appSettings?.shopName || "Zyphra POS";
  const itemLines = (inv.items || []).map((it) => {
    let line = `  • ${it.name} × ${it.qty}  —  ${fmtCurrency(it.lineTotal || 0)}`;
    if (it.serialNo) line += `\n    S/N: ${it.serialNo}`;
    if (it.warrantyMonths) line += `  |  Warranty: ${it.warrantyMonths} mo`;
    return line;
  }).join("\n");

  const orderDate = inv.date ? formatDate(inv.date) : "";
  const message =
`Hi ${customer.name}! 👋

This is a reminder about your advance order *${inv.id}*${orderDate ? ` placed on ${orderDate}` : ""}.

📦 *Items:*
${itemLines}

💰 *Order Total:* ${fmtCurrency(inv.total || 0)}
✅ *Advance Paid:* ${fmtCurrency(inv.paidAmount || 0)}
🔴 *Balance on Delivery:* ${fmtCurrency(inv.creditAmount || 0)}

Please contact us to arrange delivery or for any queries. Thank you! 🙏
— ${storeName}`;

  const btn = document.querySelector(`.adv-wa-remind[data-id="${invoiceId}"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Sending…</span>`; }

  try {
    const res = await fetch("/api/whatsapp/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: customer.phone, message }),
    });
    const data = await res.json();
    if (data.ok) {
      showAppToast(`✅ Reminder sent to ${customer.name}`, "#16a34a");
      if (btn) btn.innerHTML = `<i class="fas fa-check"></i><span>Sent</span>`;
      return true;
    } else {
      showAppToast(`❌ Failed (${customer.name}): ` + (data.error || "Unknown error"), "#dc2626");
      if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-brands fa-whatsapp"></i><span>Remind</span>`; }
      return false;
    }
  } catch (err) {
    showAppToast("❌ Network error: " + err.message, "#dc2626");
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-brands fa-whatsapp"></i><span>Remind</span>`; }
    return false;
  }
}

async function sendAdvanceWAReminderAll() {
  const pending = invoices.filter(
    (i) => i.paymentMethod === "advance" && (i.creditAmount || 0) > 0.001
  );
  const withPhone = pending.filter((i) => {
    const c = customers.find((cu) => cu.id === i.customer);
    return c?.phone;
  });

  if (withPhone.length === 0) {
    showAppToast("No pending advance orders with customer phone numbers found.", "#b45309");
    return;
  }

  const confirmSend = confirm(
    `Send WhatsApp reminders to ${withPhone.length} customer${withPhone.length !== 1 ? "s" : ""} with pending advance orders?`
  );
  if (!confirmSend) return;

  const remindAllBtn = $("#adv-remind-all-btn");
  if (remindAllBtn) { remindAllBtn.disabled = true; remindAllBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sending…`; }

  let ok = 0, fail = 0;
  for (const inv of withPhone) {
    const sent = await sendAdvanceWAReminder(inv.id);
    if (sent) ok++; else fail++;
    await new Promise((r) => setTimeout(r, 800));
  }

  if (remindAllBtn) { remindAllBtn.disabled = false; remindAllBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Remind All`; }
  if (fail === 0) {
    showAppToast(`✅ Reminders sent to ${ok} customer${ok !== 1 ? "s" : ""}.`, "#16a34a");
  } else {
    showAppToast(`⚠️ Sent: ${ok}, Failed: ${fail}. Check WhatsApp connection.`, "#b45309");
  }
}

function submitAdvanceDelivery() {
  if (!_advDeliveryInvoiceId) return;
  const inv = invoices.find((i) => i.id === _advDeliveryInvoiceId);
  if (!inv) return;

  const amount = Number($("#adv-del-amount")?.value) || 0;
  const method = $("#adv-del-method")?.value || "cash";
  const note = ($("#adv-del-note")?.value || "").trim();
  const balance = inv.creditAmount || 0;

  if (amount < 0) {
    alert("Amount cannot be negative.");
    return;
  }
  if (amount > balance + 0.001) {
    if (!confirm(`Entered amount (${fmtCurrency(amount)}) exceeds balance (${fmtCurrency(balance)}). Apply only ${fmtCurrency(balance)}?`)) return;
  }

  const apply = Math.min(amount, balance);
  inv.paidAmount = (inv.paidAmount || 0) + apply;
  inv.creditAmount = Math.max(0, balance - apply);
  inv.creditStatus = inv.creditAmount <= 0.001 ? "paid" : "partial";
  inv.payments = inv.payments || [];
  inv.payments.push({
    date: timestamp(),
    amount: apply,
    method,
    note: note || "Balance collected on delivery",
    by: currentUser || "unknown",
  });

  // Deduct stock from inventory now that the item has physically left the shop
  if (!inv.stockDeducted) {
    (inv.items || []).forEach((item) => {
      const p = products.find((x) => x.id === item.id);
      if (p) p.stock = Math.max(0, p.stock - (item.qty || 1));
    });
    inv.stockDeducted = true;
  }

  saveAllData();
  closeAdvanceDeliveryModal();
  showAppToast(`✅ Delivery confirmed for ${inv.id}. ${fmtCurrency(apply)} collected. Stock updated.`, "#16a34a");

  renderAdvanceView();
  if ($("#view-invoices")?.classList.contains("active")) renderInvoicesTable();
  if ($("#view-products")?.classList.contains("active")) renderProductsTable();
}

function saveCustomer() {
  const name = $("#c-name")?.value.trim();
  const email = $("#c-email")?.value.trim();
  const phone = $("#c-phone")?.value.trim();
  const birthday = $("#c-birthday")?.value || "";
  const address = $("#c-address")?.value.trim();
  const tagsRaw = $("#c-tags")?.value.trim() || "";
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!name) {
    alert("Name is required");
    return;
  }

  if (editingCustomerId) {
    const c = customers.find((x) => x.id === editingCustomerId);
    if (c) {
      c.name = name;
      c.email = email;
      c.phone = phone;
      c.birthday = birthday;
      c.address = address;
      c.tags = tags;
    }
  } else {
    customers.push({
      id: genId(),
      name,
      email,
      phone,
      birthday,
      address,
      tags,
      createdAt: timestamp(),
    });
    if (phone) {
      const welcomeMsg = `🎉 Welcome to ${BIZ_NAME}!\n\nHello ${name}, you are now a registered customer with us. We're glad to have you!\n\nThank you for choosing ${BIZ_NAME}. 🛍️`;
      fetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: welcomeMsg }),
      }).then((r) => {
        if (r.ok) console.log(`📱 Welcome WhatsApp sent to ${name} (${phone})`);
        else console.warn("⚠️ Welcome WhatsApp not sent (WA may not be connected)");
      }).catch(() => {});
    }
  }
  saveAllData();
  closeCustomerModal();
  renderCustomersTable();
}

// ==================== EXPENSES MODAL ====================
function openAddExpenseModal() {
  if ($("#expense-name")) $("#expense-name").value = "";
  if ($("#expense-amount")) $("#expense-amount").value = "";
  if ($("#expense-category-input")) $("#expense-category-input").value = ""; // resets select to "-- Select Category --"
  if ($("#expense-description")) $("#expense-description").value = "";
  if ($("#expense-date")) $("#expense-date").valueAsDate = new Date();
  $("#expense-modal")?.classList.remove("hidden");
}

function closeExpenseModal() {
  $("#expense-modal")?.classList.add("hidden");
}

function saveExpense() {
  const name = $("#expense-name")?.value.trim();
  const amount = Number($("#expense-amount")?.value) || 0;
  const category = $("#expense-category-input")?.value.trim();
  const description = $("#expense-description")?.value.trim();
  const date = $("#expense-date")?.value;

  if (!name || !category) {
    alert("Name and category are required");
    return;
  }

  expenses.push({
    id: genId(),
    name,
    amount,
    category,
    description,
    date,
    createdAt: timestamp(),
  });
  saveAllData();
  closeExpenseModal();
  renderExpensesTable();
  updateDashboard();
}

// ==================== UTILITIES ====================
const VIEW_ORDER = ["billing","products","customers","invoices","expenses","purchasing","analytics","settings"];

function firstAllowedView() {
  // Cashiers usually want billing first; otherwise first permitted view in order
  for (const v of VIEW_ORDER) {
    if (hasPermission(v)) return v;
  }
  return "billing";
}

function switchView(view) {
  // Enforce permission — if user has no access, fall back to first allowed view
  if (!hasPermission(view)) {
    const fallback = firstAllowedView();
    if (fallback === view) return; // nothing allowed; just stop
    view = fallback;
  }

  qsa(".view").forEach((s) => s.classList.remove("active"));
  const viewEl = $(`#view-${view}`);
  if (viewEl) viewEl.classList.add("active");

  // Sync active state on sidebar nav buttons
  qsa(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));

  closeMobileMenu();

  if (view === "analytics") updateDashboard();
  else if (view === "invoices") setInvoicesViewMode(false);
  else if (view === "products") renderProductsTable();
  else if (view === "customers") renderCustomersTable();
  else if (view === "credit") renderCreditView();
  else if (view === "advance") renderAdvanceView();
  else if (view === "expenses") renderExpensesTable();
  else if (view === "purchasing") {
    renderSuppliersList();
    updatePurchaseProductSuggestions();
    populatePurchaseSupplierDropdown();
    hidePurchaseForm();
    const histSec = $("#purchase-history-section");
    const supSec  = $("#suppliers-list-section");
    if (histSec) histSec.classList.add("hidden");
    if (supSec)  supSec.classList.remove("hidden");
  } else if (view === "billing") {
    updateSearchSuggestions();
    renderCart();
  } else if (view === "settings") loadSettingsView();
  else if (view === "quotations") renderQuotationsView();
  else if (view === "warranties") renderWarrantiesView();
  else if (view === "loyalty") renderLoyaltyView();
  else if (view === "cashdrawer") renderCashDrawerView();
  else if (view === "returns") { switchView("invoices"); switchInvoiceTab("returns"); return; }
}

function switchInvoiceTab(tab) {
  const invPanel  = $("#inv-panel-invoices");
  const retPanel  = $("#inv-panel-returns");
  const invTabBtn = $("#inv-tab-invoices");
  const retTabBtn = $("#inv-tab-returns");
  if (!invPanel || !retPanel) return;

  const active   = "color:var(--primary);border-bottom:2px solid var(--primary);margin-bottom:-2px;transition:all .2s;";
  const inactive = "color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .2s;";
  const base     = "padding:10px 22px;font-size:14px;font-weight:600;background:none;border:none;cursor:pointer;";

  if (tab === "returns") {
    invPanel.classList.add("hidden");
    retPanel.classList.remove("hidden");
    if (invTabBtn) invTabBtn.style.cssText = base + inactive;
    if (retTabBtn) retTabBtn.style.cssText = base + active;
    renderReturnsView();
  } else {
    retPanel.classList.add("hidden");
    invPanel.classList.remove("hidden");
    if (invTabBtn) invTabBtn.style.cssText = base + active;
    if (retTabBtn) retTabBtn.style.cssText = base + inactive;
    renderInvoicesTable();
  }
}

function seedSampleData() {
  fetch("database/products.json")
    .then((res) => res.json())
    .then((sample) => {
      products = sample.map((p) => ({
        ...p,
        id: p.id || genId(),
        category: p.category || "General",
        sku: p.sku || p.code,
      }));
      saveAllData();
      renderProductsTable();
      updateDashboard();
      alert("✅ Sample data loaded!");
    })
    .catch(() => alert("Could not load sample data"));
}

function clearAllData() {
  if (confirm("⚠️ Delete ALL data? This cannot be undone!")) {
    products = [];
    invoices = [];
    customers = [];
    expenses = [];
    cart = [];
    purchases = [];
    suppliers = [];
    returns = [];
    saveAllData();
    renderProductsTable();
    renderCart();
    updateDashboard();
    alert("All data cleared");
  }
}

function logout() {
  const token = localStorage.getItem("pos_token") || "";
  if (token) {
    fetch("/api/auth/logout", { method: "POST", headers: { "x-pos-token": token } }).catch(() => {});
  }
  localStorage.removeItem("pos_logged_in");
  localStorage.removeItem("pos_user");
  localStorage.removeItem("pos_token");
  window.location.replace("/login");
}

// ==================== MOBILE MENU ====================
function openMobileMenu() {
  const sidebar = $("#sidebar");
  const overlay = $("#sidebar-overlay");
  if (sidebar) sidebar.classList.add("open");
  if (overlay) overlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeMobileMenu() {
  const sidebar = $("#sidebar");
  const overlay = $("#sidebar-overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
  document.body.style.overflow = "";
}

// ==================== HELPER ====================
function on(id, event, handler) {
  const el = $("#" + id);
  if (el) el.addEventListener(event, handler);
}

// ==================== EMPLOYER MANAGEMENT ====================
const ROLE_PRESETS = {
  admin: [
    "products",
    "billing",
    "customers",
    "invoices",
    "credit",
    "expenses",
    "purchasing",
    "analytics",
    "settings",
  ],
  manager: [
    "products",
    "billing",
    "customers",
    "invoices",
    "credit",
    "expenses",
    "purchasing",
    "analytics",
  ],
  cashier: ["billing", "invoices", "credit"],
  custom: [],
};

function applyAccessControl() {
  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    const view = btn.dataset.view;
    if (view === "settings") {
      btn.style.display = hasPermission("settings") ? "" : "none";
    } else {
      btn.style.display = hasPermission(view) ? "" : "none";
    }
  });
  if (isAdmin()) {
    document
      .querySelectorAll(".admin-only")
      .forEach((el) => (el.style.display = ""));
  }
}

async function loadEmployersTable() {
  const tbody = document.getElementById("employers-tbody");
  if (!tbody) return;
  try {
    const res = await fetch("/api/employers", {
      headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") },
    });
    const data = await res.json();
    if (!data.ok) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:#f87171;">${data.error}</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    data.users.forEach((u) => {
      const perms =
        u.role === "admin"
          ? "All sections"
          : (u.permissions || []).join(", ") || "None";
      const date = u.createdAt
        ? new Date(u.createdAt).toLocaleDateString()
        : "-";
      const bdayStr = u.birthday
        ? new Date(u.birthday + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
        : "-";
      const isSelf = u.username === currentUser;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight:600;">${escapeHtml(u.fullName || u.username)}${isSelf ? ' <span style="font-size:10px;background:#7c3aed33;color:#c084fc;padding:1px 6px;border-radius:8px;">You</span>' : ""}</div>
          <div style="font-size:11px;color:var(--muted);">@${escapeHtml(u.username)}</div>
        </td>
        <td style="font-size:12px;color:var(--muted);">${u.phone ? '<i class="fab fa-whatsapp" style="color:#25d366;margin-right:4px;"></i>' + escapeHtml(u.phone) : '<span style="color:#4b5563;">—</span>'}</td>
        <td style="font-size:12px;color:var(--muted);">${bdayStr}</td>
        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
        <td style="font-size:12px;color:#9ca3af;max-width:180px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(perms)}</td>
        <td style="font-size:12px;color:#6b7280;">${date}</td>
        <td style="text-align:right;">
          <button class="small" onclick="openEditEmployerModal('${u.id}')" style="margin-right:4px;"><i class="fas fa-edit"></i></button>
          ${!isSelf ? `<button class="small danger" onclick="deleteEmployer('${u.id}','${escapeHtml(u.username)}')"><i class="fas fa-trash"></i></button>` : ""}
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:#f87171;">Failed to load employers</td></tr>`;
  }
}

let allEmployersList = [];

async function getAllEmployers() {
  try {
    const res = await fetch("/api/employers", {
      headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") },
    });
    const data = await res.json();
    allEmployersList = data.ok ? data.users : [];
  } catch {
    allEmployersList = [];
  }
}

function openAddEmployerModal() {
  document.getElementById("employer-modal-title").textContent = "Add Employer";
  document.getElementById("emp-id").value = "";
  document.getElementById("emp-username").value = "";
  document.getElementById("emp-password").value = "";
  document.getElementById("emp-fullname").value = "";
  document.getElementById("emp-phone").value = "";
  document.getElementById("emp-birthday").value = "";
  document.getElementById("emp-role").value = "cashier";
  document.getElementById("emp-username").readOnly = false;
  setEmpPermissions(ROLE_PRESETS.cashier);
  document.getElementById("employer-modal").classList.remove("hidden");
}

async function openEditEmployerModal(id) {
  await getAllEmployers();
  const user = allEmployersList.find((u) => u.id === id);
  if (!user) return;
  document.getElementById("employer-modal-title").textContent = "Edit Employer";
  document.getElementById("emp-id").value = user.id;
  document.getElementById("emp-username").value = user.username;
  document.getElementById("emp-username").readOnly = true;
  document.getElementById("emp-password").value = "";
  document.getElementById("emp-fullname").value = user.fullName || "";
  document.getElementById("emp-phone").value = user.phone || "";
  document.getElementById("emp-birthday").value = user.birthday || "";
  document.getElementById("emp-role").value = user.role;
  setEmpPermissions(user.permissions || []);
  document.getElementById("employer-modal").classList.remove("hidden");
}

function setEmpPermissions(perms) {
  document.querySelectorAll(".emp-perm").forEach((cb) => {
    cb.checked = perms.includes(cb.value);
  });
}

function getEmpPermissions() {
  return [...document.querySelectorAll(".emp-perm:checked")].map(
    (cb) => cb.value,
  );
}

function closeEmployerModal() {
  document.getElementById("employer-modal").classList.add("hidden");
}

async function saveEmployer() {
  const id = document.getElementById("emp-id").value;
  const username = document.getElementById("emp-username").value.trim();
  const password = document.getElementById("emp-password").value;
  const role = document.getElementById("emp-role").value;
  const fullName = document.getElementById("emp-fullname").value.trim();
  const phone = document.getElementById("emp-phone").value.trim();
  const birthday = document.getElementById("emp-birthday").value;
  let permissions = role === "admin" ? ROLE_PRESETS.admin : getEmpPermissions();

  if (!username) {
    alert("Username is required");
    return;
  }
  if (!id && !password) {
    alert("Password is required for new accounts");
    return;
  }

  const isEdit = !!id;
  const url = isEdit ? `/api/employers/${id}` : "/api/employers";
  const method = isEdit ? "PUT" : "POST";
  const extra = { fullName, phone, birthday };
  const body = isEdit
    ? { role, permissions, ...extra, ...(password ? { password } : {}) }
    : { username, password, role, permissions, ...extra };

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-pos-token": (localStorage.getItem("pos_token") || ""),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      closeEmployerModal();
      showSettingsToast(isEdit ? "✅ Employer updated!" : "✅ Employer added!");
      loadEmployersTable();
    } else {
      alert("❌ " + (data.error || "Failed to save"));
    }
  } catch (e) {
    alert("❌ Error: " + e.message);
  }
}

async function deleteEmployer(id, username) {
  if (!confirm(`Delete account "${username}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/employers/${id}`, {
      method: "DELETE",
      headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") },
    });
    const data = await res.json();
    if (data.ok) {
      showSettingsToast("✅ Employer deleted");
      loadEmployersTable();
    } else {
      alert("❌ " + (data.error || "Failed to delete"));
    }
  } catch (e) {
    alert("❌ Error: " + e.message);
  }
}

// ==================== SETTINGS ====================
async function loadSettingsView() {
  try {
    const res = await fetch("/api/settings");
    const cfg = await res.json();
    const appCfg = window.APP_CONFIG || {};
    const get = (key, fallback = "") =>
      cfg[key] !== undefined
        ? cfg[key]
        : appCfg[key] !== undefined
          ? appCfg[key]
          : fallback;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) {
        if (el.type === "checkbox") el.checked = !!val;
        else el.value = val;
      }
    };

    setVal("cfg-businessName", get("businessName", "SD COMPUTERS"));
    setVal("cfg-appTagline", get("appTagline", "smart computer store"));
    setVal("cfg-businessAddress", get("businessAddress", ""));
    setVal("cfg-businessPhone", get("businessPhone", ""));
    setVal("cfg-businessEmail", get("businessEmail", ""));
    setVal("cfg-timezone", get("timezone", "Asia/Colombo"));
    setVal("cfg-currencySymbol", get("currencySymbol", "Rs"));
    setVal("cfg-currencyCode", get("currencyCode", "LKR"));
    setVal("cfg-currencyLocale", get("currencyLocale", "si-LK"));

    setVal("cfg-invoiceFooter", get("invoiceFooter", "Thank you for your purchase!"));
    setVal("cfg-paymentLink", get("paymentLink", ""));
    setVal("cfg-invoiceWatermark", get("invoiceWatermark", "Verified Invoice"));
    setVal("cfg-invoiceLogoSize", get("invoiceLogoSize", "28mm"));
    setVal("cfg-invoiceShowQR", get("invoiceShowQR", true));
    setVal("cfg-invoiceShowLogo", get("invoiceShowLogo", true));
    setVal("cfg-invoiceShowBizName", get("invoiceShowBizName", true));
    const hCol = get("invoiceHeaderColor", "#1a3a5c");
    setVal("cfg-invoiceHeaderColor", hCol);
    setVal("cfg-invoiceHeaderColorHex", hCol);
    const terms = Array.isArray(cfg.termsAndConditions)
      ? cfg.termsAndConditions.join("\n")
      : cfg.termsAndConditions || "";
    setVal("cfg-termsAndConditions", terms);

    const rcpColor = get("receiptHeaderColor", "#1a3a5c");
    setVal("cfg-receiptHeaderColor", rcpColor);
    setVal("cfg-receiptHeaderColorHex", rcpColor);
    setVal(
      "cfg-receiptFooter",
      get("receiptFooter", "Thank you! Please come again."),
    );
    setVal("cfg-receiptNote", get("receiptNote", ""));
    setVal("cfg-receiptShowTax", get("receiptShowTax", true));
    setVal("cfg-receiptShowDiscount", get("receiptShowDiscount", true));

    setVal("cfg-defaultTaxPercent", get("defaultTaxPercent", 0));
    setVal("cfg-lowStockThreshold", get("lowStockThreshold", 5));
    setVal("cfg-appName", get("appName", "Zyphra POS"));
    setVal("cfg-autoPriceCalc", get("autoPriceCalc", false));
    setVal("cfg-wholesaleMarkup", get("wholesaleMarkup", 20));
    setVal("cfg-bestMarkup",      get("bestMarkup",      30));
    setVal("cfg-retailMarkup",    get("retailMarkup",    25));
    setVal("cfg-chatbotApiUrl", get("chatbotApiUrl", ""));
    setVal("cfg-mistralApiKey", get("mistralApiKey", ""));
    setVal(
      "cfg-mistralModel",
      get("mistralModel", "mistralai/mistral-7b-instruct-v0.3"),
    );
    setVal("cfg-aiFallbackEnabled", get("aiFallbackEnabled", true));
    setVal("cfg-chatbotGroupsEnabled", get("chatbotGroupsEnabled", false));
    setVal("cfg-chatbotGroupsList", get("chatbotGroupsList", ""));

    // Anti-spam fields
    setVal("cfg-spamEnabled", get("spamEnabled", true));
    setVal("cfg-spamMaxPerMin", get("spamMaxPerMin", 8));
    setVal("cfg-spamMaxPerHour", get("spamMaxPerHour", 40));
    setVal("cfg-spamDupWindowSec", get("spamDupWindowSec", 12));
    setVal("cfg-spamMaxDuplicates", get("spamMaxDuplicates", 3));
    setVal("cfg-spamViolationsToBlock", get("spamViolationsToBlock", 6));
    setVal("cfg-spamAutoBlockMin", get("spamAutoBlockMin", 60));
    const kws = Array.isArray(get("spamKeywords", [])) ? get("spamKeywords", []).join(", ") : (get("spamKeywords", "") || "");
    setVal("cfg-spamKeywords", kws);

    // EOD Report fields
    setVal("cfg-eodReportEnabled", get("eodReportEnabled", false));
    setVal("cfg-eodReportTime", get("eodReportTime", "21:00"));
    setVal("cfg-eodReportPhone", get("eodReportPhone", ""));

    // GitHub backup fields
    setVal("cfg-githubBackupEnabled", get("githubBackupEnabled", false));
    setVal("cfg-githubToken", get("githubToken", ""));
    setVal("cfg-githubRepo", get("githubRepo", ""));
    setVal("cfg-githubBranch", get("githubBranch", "main"));
    setVal(
      "cfg-githubBackupSchedule",
      get("githubBackupSchedule", "0 3 * * *"),
    );
    refreshGithubBackupStatus();

    // Email / SMTP
    setVal("cfg-smtpHost",    get("smtpHost", "smtp.gmail.com"));
    setVal("cfg-smtpPort",    get("smtpPort", 587));
    setVal("cfg-smtpUser",    get("smtpUser", ""));
    setVal("cfg-smtpPassword",get("smtpPassword", ""));
    setVal("cfg-smtpFromName",get("smtpFromName", get("businessName", "SD Computers")));
    setVal("cfg-smtpSecure",  get("smtpSecure", false));
    setVal("cfg-emailEnabled", get("emailEnabled", false));
    setVal("cfg-emailInvoiceSubject", get("emailInvoiceSubject", "Your Invoice from {business}"));
    setVal("cfg-emailBodyText", get("emailBodyText", "Please find your invoice attached. Thank you for your business!"));

    // Sync color pickers ↔ hex inputs
    const syncColor = (pickerId, hexId) => {
      const picker = document.getElementById(pickerId);
      const hex = document.getElementById(hexId);
      if (!picker || !hex) return;
      picker.addEventListener("input", () => {
        hex.value = picker.value;
      });
      hex.addEventListener("input", () => {
        if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value;
      });
    };
    syncColor("cfg-receiptHeaderColor", "cfg-receiptHeaderColorHex");
    syncColor("cfg-quotationHeaderColor", "cfg-quotationHeaderColorHex");

    // Quotation settings
    const quoteColor = get("quotationHeaderColor", "#1a3a5c");
    setVal("cfg-quotationHeaderColor", quoteColor);
    setVal("cfg-quotationHeaderColorHex", quoteColor);
    setVal("cfg-quotationFooter", get("quotationFooter", "Thank you for choosing us!"));
    setVal("cfg-quotationWatermark", get("quotationWatermark", ""));
    setVal("cfg-quotationValidityDays", get("quotationValidityDays", 7));
    setVal("cfg-quotationDefaultNotes", get("quotationDefaultNotes", ""));
    const qTerms = Array.isArray(cfg.quotationTerms)
      ? cfg.quotationTerms.join("\n")
      : (cfg.quotationTerms || "");
    setVal("cfg-quotationTerms", qTerms);
  } catch (e) {
    console.error("Settings load error:", e);
  }
}

function previewLogoFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById("logo-preview-img");
    const noImg = document.getElementById("logo-no-img");
    if (img) { img.src = e.target.result; img.style.display = "block"; }
    if (noImg) noImg.style.display = "none";
    const status = document.getElementById("logo-upload-status");
    if (status) status.textContent = file.name + " selected";
  };
  reader.readAsDataURL(file);
}

async function uploadLogo() {
  const input = document.getElementById("cfg-logo-upload");
  const status = document.getElementById("logo-upload-status");
  const btn = document.getElementById("btn-upload-logo");
  if (!input || !input.files[0]) {
    if (status) status.textContent = "Please select an image file first.";
    return;
  }
  const file = input.files[0];
  if (file.size > 10 * 1024 * 1024) {
    if (status) status.textContent = "File too large. Max 10 MB.";
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…'; }
  if (status) { status.style.color = "#9ca3af"; status.textContent = "Uploading…"; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const base64 = e.target.result.split(",")[1];
      const res = await fetch("/api/upload-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-pos-token": (localStorage.getItem("pos_token") || "") },
        body: JSON.stringify({ data: base64, mimeType: file.type }),
      });
      const json = await res.json();
      if (json.ok) {
        const ts = Date.now();
        const img = document.getElementById("logo-preview-img");
        if (img) { img.src = `/assets/logo.jpeg?t=${ts}`; img.style.display = "block"; }
        const noImg = document.getElementById("logo-no-img");
        if (noImg) noImg.style.display = "none";
        if (status) { status.style.color = "#22c55e"; status.textContent = "Logo uploaded successfully!"; }
        input.value = "";
      } else {
        if (status) { status.style.color = "#ef4444"; status.textContent = "Error: " + (json.error || "Upload failed"); }
      }
    } catch (err) {
      if (status) { status.style.color = "#ef4444"; status.textContent = "Network error: " + err.message; }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload Logo'; }
    }
  };
  reader.readAsDataURL(file);
}

async function saveSettingsData() {
  const getVal = (id) => {
    const el = document.getElementById(id);
    if (!el) return undefined;
    if (el.type === "checkbox") return el.checked;
    if (el.type === "number") return Number(el.value);
    return el.value.trim();
  };

  const termsRaw = getVal("cfg-termsAndConditions") || "";
  const terms = termsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = {
    businessName: getVal("cfg-businessName"),
    appTagline: getVal("cfg-appTagline"),
    businessAddress: getVal("cfg-businessAddress"),
    businessPhone: getVal("cfg-businessPhone"),
    businessEmail: getVal("cfg-businessEmail"),
    timezone: getVal("cfg-timezone"),
    currencySymbol: getVal("cfg-currencySymbol"),
    currencyCode: getVal("cfg-currencyCode"),
    currencyLocale: getVal("cfg-currencyLocale"),
    invoiceFooter: getVal("cfg-invoiceFooter"),
    paymentLink: getVal("cfg-paymentLink"),
    invoiceWatermark: getVal("cfg-invoiceWatermark"),
    invoiceLogoSize: getVal("cfg-invoiceLogoSize"),
    invoiceHeaderColor: getVal("cfg-invoiceHeaderColor") || "#1a3a5c",
    invoiceShowQR: getVal("cfg-invoiceShowQR"),
    invoiceShowLogo: getVal("cfg-invoiceShowLogo"),
    invoiceShowBizName: getVal("cfg-invoiceShowBizName"),
    termsAndConditions: terms,
    receiptHeaderColor: getVal("cfg-receiptHeaderColor"),
    receiptFooter: getVal("cfg-receiptFooter"),
    receiptNote: getVal("cfg-receiptNote"),
    receiptShowTax: getVal("cfg-receiptShowTax"),
    receiptShowDiscount: getVal("cfg-receiptShowDiscount"),
    defaultTaxPercent: getVal("cfg-defaultTaxPercent"),
    lowStockThreshold: getVal("cfg-lowStockThreshold"),
    appName: getVal("cfg-appName"),
    autoPriceCalc:    getVal("cfg-autoPriceCalc"),
    wholesaleMarkup:  getVal("cfg-wholesaleMarkup"),
    bestMarkup:       getVal("cfg-bestMarkup"),
    retailMarkup:     getVal("cfg-retailMarkup"),
    chatbotApiUrl: getVal("cfg-chatbotApiUrl"),
    mistralApiKey: getVal("cfg-mistralApiKey"),
    mistralModel: getVal("cfg-mistralModel"),
    aiFallbackEnabled: getVal("cfg-aiFallbackEnabled"),
    chatbotGroupsEnabled: getVal("cfg-chatbotGroupsEnabled"),
    chatbotGroupsList: getVal("cfg-chatbotGroupsList"),
    githubBackupEnabled: getVal("cfg-githubBackupEnabled"),
    githubToken: getVal("cfg-githubToken"),
    githubRepo: getVal("cfg-githubRepo"),
    githubBranch: getVal("cfg-githubBranch") || "main",
    githubBackupSchedule: getVal("cfg-githubBackupSchedule") || "0 3 * * *",
    eodReportEnabled: getVal("cfg-eodReportEnabled"),
    eodReportTime: getVal("cfg-eodReportTime") || "21:00",
    eodReportPhone: getVal("cfg-eodReportPhone") || "",
    emailEnabled: getVal("cfg-emailEnabled"),
    smtpHost: getVal("cfg-smtpHost"),
    smtpPort: Number(getVal("cfg-smtpPort")) || 587,
    smtpUser: getVal("cfg-smtpUser"),
    smtpPassword: getVal("cfg-smtpPassword"),
    smtpFromName: getVal("cfg-smtpFromName"),
    smtpSecure: getVal("cfg-smtpSecure"),
    emailInvoiceSubject: getVal("cfg-emailInvoiceSubject"),
    emailBodyText: getVal("cfg-emailBodyText"),
    quotationHeaderColor: getVal("cfg-quotationHeaderColor"),
    quotationFooter: getVal("cfg-quotationFooter"),
    quotationWatermark: getVal("cfg-quotationWatermark"),
    quotationValidityDays: Number(getVal("cfg-quotationValidityDays")) || 7,
    quotationDefaultNotes: getVal("cfg-quotationDefaultNotes"),
    quotationTerms: (getVal("cfg-quotationTerms") || "").split("\n").map(s => s.trim()).filter(Boolean),
    spamEnabled: getVal("cfg-spamEnabled"),
    spamMaxPerMin: Number(getVal("cfg-spamMaxPerMin")) || 8,
    spamMaxPerHour: Number(getVal("cfg-spamMaxPerHour")) || 40,
    spamDupWindowSec: Number(getVal("cfg-spamDupWindowSec")) || 12,
    spamMaxDuplicates: Number(getVal("cfg-spamMaxDuplicates")) || 3,
    spamViolationsToBlock: Number(getVal("cfg-spamViolationsToBlock")) || 6,
    spamAutoBlockMin: Number(getVal("cfg-spamAutoBlockMin")) || 60,
    spamKeywords: (getVal("cfg-spamKeywords") || "").split(",").map(k => k.trim().toLowerCase()).filter(Boolean),
  };

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      // Update in-memory APP_CONFIG so frontend reflects changes immediately
      if (window.APP_CONFIG) {
        Object.assign(window.APP_CONFIG, payload);
      }
      // Re-render invoice/receipt modal if it's open, so user sees changes live
      const modal = document.getElementById("invoice-modal");
      if (
        modal &&
        !modal.classList.contains("hidden") &&
        _currentModalInvoice
      ) {
        const content = document.getElementById("invoice-html");
        if (content)
          content.innerHTML = buildDocumentHTML(_currentModalInvoice);
      }
      showSettingsToast("✅ Settings saved successfully!");
    } else {
      alert("❌ Failed to save: " + (data.error || "Unknown error"));
    }
  } catch (e) {
    alert("❌ Save error: " + e.message);
  }
}

// ──────────── Template preview (uses unsaved form values) ──────
function previewTemplate(kind) {
  const getVal = (id) => {
    const el = document.getElementById(id);
    if (!el) return undefined;
    if (el.type === "checkbox") return el.checked;
    if (el.type === "number") return Number(el.value);
    return el.value.trim();
  };
  const termsRaw = getVal("cfg-termsAndConditions") || "";
  const terms = termsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // Snapshot real config, override with current form values
  const original = window.APP_CONFIG || {};
  const overrides = {
    businessName: getVal("cfg-businessName") ?? original.businessName,
    businessAddress: getVal("cfg-businessAddress") ?? original.businessAddress,
    businessPhone: getVal("cfg-businessPhone") ?? original.businessPhone,
    businessEmail: getVal("cfg-businessEmail") ?? original.businessEmail,
    invoiceFooter: getVal("cfg-invoiceFooter") ?? original.invoiceFooter,
    invoiceWatermark: getVal("cfg-invoiceWatermark") ?? original.invoiceWatermark,
    invoiceLogoSize: getVal("cfg-invoiceLogoSize") ?? original.invoiceLogoSize,
    invoiceHeaderColor: getVal("cfg-invoiceHeaderColor") ?? original.invoiceHeaderColor,
    invoiceShowQR: getVal("cfg-invoiceShowQR"),
    invoiceShowLogo: getVal("cfg-invoiceShowLogo"),
    invoiceShowBizName: getVal("cfg-invoiceShowBizName"),
    termsAndConditions: terms.length ? terms : original.termsAndConditions,
    receiptHeaderColor:
      getVal("cfg-receiptHeaderColor") ?? original.receiptHeaderColor,
    receiptFooter: getVal("cfg-receiptFooter") ?? original.receiptFooter,
    receiptNote: getVal("cfg-receiptNote") ?? original.receiptNote,
    receiptShowTax: getVal("cfg-receiptShowTax"),
    receiptShowDiscount: getVal("cfg-receiptShowDiscount"),
  };
  const backup = { ...original };
  window.APP_CONFIG = window.APP_CONFIG || {};
  Object.assign(window.APP_CONFIG, overrides);

  // Sample invoice
  const sample = {
    id: "PREVIEW-" + new Date().toISOString().slice(0, 10),
    docType: kind === "receipt" ? "receipt" : "invoice",
    date: new Date().toISOString(),
    customer: null,
    paymentMethod: "cash",
    soldBy: "Demo User",
    status: "completed",
    items: [
      {
        name: "Sample Product A",
        sku: "SKU001",
        qty: 2,
        price: 1500,
        discountPct: 0,
      },
      {
        name: "Sample Product B",
        sku: "SKU002",
        qty: 1,
        price: 2750,
        discountPct: 10,
        serialNo: "SN-12345",
      },
      {
        name: "Sample Product C",
        sku: "SKU003",
        qty: 3,
        price: 500,
        discountPct: 0,
      },
    ],
    subtotal: 7725,
    itemDiscountTotal: 275,
    discountAmt: 0,
    taxPct: 5,
    taxAmt: 372.5,
    total: 7822.5,
    notes: "This is a preview using your current settings.",
  };

  try {
    _currentModalInvoice = sample;
    const modal = document.getElementById("invoice-modal");
    const content = document.getElementById("invoice-html");
    if (modal && content) {
      content.innerHTML = buildDocumentHTML(sample);
      modal.dataset.doctype = sample.docType;
      modal.classList.remove("hidden");
    }
  } finally {
    // Restore real config (but keep override visible until modal close — actually restore now, modal HTML is already rendered)
    // We need to KEEP overrides for re-renders; safer: just keep overrides since user is previewing.
    // Actually restore so unrelated screens use real config:
    Object.keys(overrides).forEach((k) => {
      delete window.APP_CONFIG[k];
    });
    Object.assign(window.APP_CONFIG, backup);
  }
}

// ──────────── GitHub Backup helpers ─────────────────────────────
async function refreshGithubBackupStatus() {
  const box = document.getElementById("github-backup-status");
  if (!box) return;
  try {
    const r = await fetch("/api/github-backup/status");
    const s = await r.json();
    const last = s.last || {};
    const lastTime = last.time ? new Date(last.time).toLocaleString() : "never";
    let lastLine = "Never run";
    if (last.status === "ok") {
      const link = last.htmlUrl
        ? `<a href="${last.htmlUrl}" target="_blank" style="color:#60a5fa">${last.file}</a>`
        : last.file;
      lastLine = `✅ Last backup: <strong>${lastTime}</strong> — ${link}`;
    } else if (last.status === "error") {
      lastLine = `❌ Last attempt: <strong>${lastTime}</strong> — ${escapeHtml(last.error || "unknown error")}`;
    } else if (last.status === "running") {
      lastLine = `⏳ Running… (started ${lastTime})`;
    }
    const stateBadge = s.enabled
      ? `<span style="background:#16a34a;color:white;padding:2px 8px;border-radius:4px;font-size:11px;">SCHEDULED</span>`
      : `<span style="background:#6b7280;color:white;padding:2px 8px;border-radius:4px;font-size:11px;">DISABLED</span>`;
    const tokenBadge = s.tokenSet
      ? `<span style="color:#16a34a;">🔑 token saved</span>`
      : `<span style="color:#9ca3af;">no token</span>`;
    box.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
        ${stateBadge}
        <span style="font-size:12px; color:#9ca3af;">Schedule: <code>${escapeHtml(s.schedule)}</code></span>
        <span style="font-size:12px;">${tokenBadge}</span>
      </div>
      <div style="font-size:13px;">${lastLine}</div>
    `;
  } catch (e) {
    box.innerHTML = `<span style="color:#dc2626;">Status load failed: ${e.message}</span>`;
  }
}

async function testGithubBackup() {
  const btn = document.getElementById("btn-github-test");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Testing…";
  }
  try {
    // Save current form values first so server uses fresh credentials
    await saveSettingsData();
    const r = await fetch("/api/github-backup/test", { method: "POST", headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") } });
    const d = await r.json();
    if (r.ok && d.ok) {
      const perms = d.permissions
        ? Object.keys(d.permissions)
            .filter((k) => d.permissions[k])
            .join(", ")
        : "—";
      alert(
        `✅ Connection OK!\n\nRepo: ${d.repo}\nPrivate: ${d.private ? "Yes" : "No"}\nDefault branch: ${d.defaultBranch}\nYour permissions: ${perms}`,
      );
    } else {
      alert("❌ Connection failed:\n\n" + (d.error || "Unknown error"));
    }
  } catch (e) {
    alert("❌ Test error: " + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔌 Test Connection";
    }
  }
}

async function downloadAllDataZip() {
  const statusEl = document.getElementById("download-zip-status");
  if (statusEl) statusEl.textContent = "⏳ Preparing download…";
  try {
    const res = await fetch("/api/download-data-zip", {
      headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Download failed");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sdpos-data-${today}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (statusEl) statusEl.textContent = "✅ Downloaded successfully!";
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 4000);
  } catch (e) {
    if (statusEl) statusEl.textContent = `❌ ${e.message}`;
  }
}

async function runGithubBackupNow() {
  const btn = document.getElementById("btn-github-backup-now");
  if (!confirm("Save the current data to GitHub now?")) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Backing up…";
  }
  try {
    await saveSettingsData();
    const r = await fetch("/api/github-backup/run", { method: "POST", headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") } });
    const d = await r.json();
    if (r.ok && d.ok) {
      showSettingsToast("✅ Backup committed to GitHub!");
      refreshGithubBackupStatus();
    } else {
      alert("❌ Backup failed:\n\n" + (d.error || "Unknown error"));
    }
  } catch (e) {
    alert("❌ Backup error: " + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "☁️ Backup Now";
    }
  }
}

async function listGithubBackups() {
  const list = document.getElementById("github-backup-list");
  const btn = document.getElementById("btn-github-list");
  if (!list) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Loading…";
  }
  list.innerHTML = `<div style="font-size:12px; color:#9ca3af; padding:8px;">Loading backups…</div>`;
  try {
    const r = await fetch("/api/github-backup/list?limit=30");
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || "List failed");
    if (!d.backups.length) {
      list.innerHTML = `<div style="font-size:12px; color:#9ca3af; padding:8px;">No backups yet — click "Backup Now" to create the first one.</div>`;
      return;
    }
    const rows = d.backups
      .map((b) => {
        const sizeKb = (b.size / 1024).toFixed(1);
        return `
        <div style="display:flex; align-items:center; gap:8px; padding:8px; border-bottom:1px solid rgba(255,255,255,0.06); font-size:13px;">
          <a href="${b.htmlUrl}" target="_blank" style="color:#60a5fa; flex:1; word-break:break-all;">${escapeHtml(b.name)}</a>
          <span style="color:#9ca3af; font-size:11px; white-space:nowrap;">${sizeKb} KB</span>
          <button class="small github-restore-btn" data-path="${escapeHtml(b.path)}" data-name="${escapeHtml(b.name)}" style="background:#dc2626;color:white;">♻️ Restore</button>
        </div>`;
      })
      .join("");
    list.innerHTML = `
      <div style="margin-top:10px; max-height:300px; overflow-y:auto; background:rgba(0,0,0,0.2); border-radius:6px;">
        <div style="padding:8px; font-size:12px; color:#9ca3af; border-bottom:1px solid rgba(255,255,255,0.06);">
          📜 ${d.backups.length} backup${d.backups.length === 1 ? "" : "s"} found (newest first):
        </div>
        ${rows}
      </div>`;
    list.querySelectorAll(".github-restore-btn").forEach((b) => {
      b.addEventListener("click", () =>
        restoreGithubBackup(b.dataset.path, b.dataset.name),
      );
    });
  } catch (e) {
    list.innerHTML = `<div style="color:#dc2626; padding:8px; font-size:13px;">❌ ${escapeHtml(e.message)}</div>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "📜 List Backups";
    }
  }
}

async function restoreGithubBackup(filePath, name) {
  if (
    !confirm(
      `⚠️ RESTORE WARNING\n\nThis will REPLACE all current data (products, customers, invoices, etc.) with the backup:\n\n${name}\n\nThis cannot be undone except by another restore. Continue?`,
    )
  )
    return;
  if (!confirm("Are you absolutely sure? Type-equivalent final check.")) return;
  try {
    const r = await fetch("/api/github-backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pos-token": (localStorage.getItem("pos_token") || "") },
      body: JSON.stringify({ filePath }),
    });
    const d = await r.json();
    if (r.ok && d.ok) {
      alert(
        `✅ Restored ${d.filesRestored} file(s) from ${name}.\n\nThe page will now reload.`,
      );
      location.reload();
    } else {
      alert(
        "❌ Restore failed:\n\n" +
          (d.error || "Unknown error") +
          (d.rolledBack ? "\n\n(Previous data was rolled back.)" : ""),
      );
    }
  } catch (e) {
    alert("❌ Restore error: " + e.message);
  }
}

// ── End-of-Day Report ─────────────────────────────────────────
async function sendEODReportNow() {
  const btn = document.querySelector('button[onclick="sendEODReportNow()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }
  try {
    const r = await fetch("/api/eod-report/send-now", {
      method: "POST",
      headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") },
    });
    const d = await r.json();
    if (d.ok) {
      alert("✅ EOD Report sent via WhatsApp successfully!");
    } else {
      alert("❌ Failed to send:\n\n" + (d.error || "Unknown error"));
    }
  } catch (e) {
    alert("❌ Error: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Send Now (Test)'; }
  }
}

async function previewEODReport() {
  const box = document.getElementById("eod-report-preview");
  if (!box) return;
  box.style.display = "block";
  box.textContent = "Loading preview…";
  try {
    const r = await fetch("/api/eod-report/preview", { headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") } });
    const d = await r.json();
    if (d.ok) {
      box.textContent = d.message;
    } else {
      box.textContent = "❌ Error: " + (d.error || "Unknown");
    }
  } catch (e) {
    box.textContent = "❌ Error: " + e.message;
  }
}

function showSettingsToast(msg) {
  let toast = document.getElementById("settings-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "settings-toast";
    toast.style.cssText =
      "position:fixed;bottom:28px;right:28px;background:#16a34a;color:#fff;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 24px #0005;transition:opacity .4s;";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = "1";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.style.opacity = "0";
  }, 2800);
}

// ==================== INITIALIZATION ====================
// ── Global fetch wrapper: redirect to login on expired session ────
const _origFetch = window.fetch.bind(window);
window.fetch = async function (input, init = {}) {
  const res = await _origFetch(input, init);
  // Only intercept JSON API calls — skip static assets, PDF blobs, etc.
  const url = typeof input === "string" ? input : (input.url || "");
  if (res.status === 401 && url.includes("/api/")) {
    // Server says session is gone (e.g. after Railway/Render restart).
    // Clear local auth state and bounce to login.
    localStorage.removeItem("pos_logged_in");
    localStorage.removeItem("pos_user");
    localStorage.removeItem("pos_token");
    window.location.replace("/login");
  }
  return res;
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!currentUser) return;

  // ── Verify server-side session is still alive ──────────────────
  // This catches Railway/Render restarts that wipe the sessions map.
  try {
    const checkRes = await _origFetch("/api/auth/check", {
      headers: { "x-pos-token": localStorage.getItem("pos_token") || "" },
    });
    if (!checkRes.ok) {
      localStorage.removeItem("pos_logged_in");
      localStorage.removeItem("pos_user");
      localStorage.removeItem("pos_token");
      window.location.replace("/login");
      return;
    }
  } catch {
    // Network error — let the app load; individual calls will handle it.
  }

  try {
    await loadAllData();
    // Hide loading screen with a smooth fade
    const ls = document.getElementById("app-loading-screen");
    if (ls) {
      ls.classList.add("als-hidden");
      setTimeout(() => ls.remove(), 520);
    }
    updateAdvanceNavBadge();

    initProfileCard();

    // Mobile menu
    on("mobile-menu-toggle", "click", openMobileMenu);
    on("sidebar-close", "click", closeMobileMenu);
    on("sidebar-overlay", "click", closeMobileMenu);

    // Navigation
    qsa(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        qsa(".nav-btn").forEach((x) => x.classList.remove("active"));
        this.classList.add("active");
        const view = this.dataset.view;
        if (view) switchView(view);
      });
    });

    // Products
    on("btn-add-product", "click", openAddProductModal);
    on("modal-cancel", "click", closeModal);
    on("modal-save", "click", saveProduct);
    on("product-category-filter", "change", renderProductsTable);
    on("product-search", "input", renderProductsTable);
    on("show-low-stock", "change", renderProductsTable);

    // Customers
    on("btn-add-customer", "click", openAddCustomerModal);
    on("customer-modal-cancel", "click", closeCustomerModal);
    on("customer-modal-save", "click", saveCustomer);
    on("wa-modal-cancel", "click", closeWAMessageModal);
    on("wa-modal-send", "click", sendWAMessage);
    on("btn-broadcast-customers", "click", openBroadcastModal);
    on("broadcast-cancel", "click", closeBroadcastModal);
    on("broadcast-send", "click", sendBroadcast);
    on("broadcast-tag-filter", "change", refreshBroadcastCount);

    // Billing
    initBillingProductSearch();

    // Sync payment-method radio pills → hidden select
    document
      .querySelectorAll("input[name='payment-method-radio']")
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          const sel = $("#payment-method");
          if (sel) sel.value = radio.value;
          toggleCreditDetails(radio.value);
        });
      });

    // Update credit balance preview when "Paid Now" changes
    on("credit-paid-now", "input", updateCreditBalanceDisplay);
    on("advance-paid-now", "input", updateAdvanceBalanceDisplay);

    // Credit view filters
    on("credit-search", "input", renderCreditView);
    on("credit-filter-status", "change", renderCreditView);

    // Advance orders
    on("adv-search", "input", renderAdvanceView);
    on("adv-filter-status", "change", renderAdvanceView);
    on("adv-del-save-btn", "click", submitAdvanceDelivery);
    on("adv-remind-all-btn", "click", sendAdvanceWAReminderAll);

    // Record-payment modal quick buttons
    document.querySelectorAll(".rp-quick-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const action = e.currentTarget.dataset.action;
        applyRpQuickAmount(action);
      });
    });
    on("rp-amount", "input", updateRpPreview);
    on("rp-save-btn", "click", submitRecordPayment);

    on("btn-clear-cart", "click", () => {
      cart = [];
      renderCart();
    });
    on("discount-percent", "input", updateCartTotals);
    on("discount-amount-input", "input", updateCartTotals);
    on("tax-percent", "input", updateCartTotals);
    on("btn-checkout", "click", checkout);
    on("btn-print-invoice", "click", () => {
      if (cart.length === 0) {
        alert("Cart is empty");
        return;
      }
      const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
      const itemDiscountTotal = cart.reduce((s, c) => {
        const g = c.price * c.qty;
        return s + g * ((c.discountPct || 0) / 100);
      }, 0);
      const afterItemDisc = subtotal - itemDiscountTotal;
      const dPct = Number($("#discount-percent")?.value) || 0;
      const dAmt = Number($("#discount-amount-input")?.value) || 0;
      const tPct = Number($("#tax-percent")?.value) || 0;
      const overallDiscount = Math.min(
        afterItemDisc,
        dAmt + (afterItemDisc * dPct) / 100,
      );
      const afterOverall = afterItemDisc - overallDiscount;
      const tax = afterOverall * (tPct / 100);
      showInvoiceModal({
        id: "PREVIEW",
        date: timestamp(),
        customer: selectedBillingCustomerId,
        docType: $("#doc-type")?.value || "invoice",
        items: cart.map((c) => ({ ...c, lineTotal: getItemLineTotal(c) })),
        subtotal,
        itemDiscountTotal,
        discountPct: dPct,
        discountAmt: overallDiscount,
        taxPct: tPct,
        taxAmt: tax,
        total: afterOverall + tax,
        paymentMethod: $("#payment-method")?.value || "cash",
      });
    });
    on("invoice-modal-close", "click", () =>
      $("#invoice-modal")?.classList.add("hidden"),
    );
    on("btn-download-invoice-pdf", "click", downloadInvoicePdf);
    on("btn-send-invoice-email", "click", sendInvoiceEmail);
    on("btn-test-email", "click", async () => {
      const btn = $("#btn-test-email");
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      try {
        const res = await fetch("/api/test-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const d = await res.json();
        if (d.ok) showSettingsToast("✅ Test email sent! Check your inbox.");
        else alert("❌ Test failed: " + (d.error || "Unknown error"));
      } catch (e) { alert("❌ " + e.message); }
      finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-vial"></i> Send Test Email'; } }
    });

    // Billing customer search
    initBillingCustomerSearch();

    // Expenses
    on("btn-add-expense", "click", openAddExpenseModal);
    on("expense-modal-cancel", "click", closeExpenseModal);
    on("expense-modal-save", "click", saveExpense);
    on("expense-search", "input", renderExpensesTable);
    on("expense-category-filter", "change", renderExpensesTable);

    // Invoices
    on("invoice-search", "input", renderInvoicesTable);
    on("invoice-filter-employee", "change", renderInvoicesTable);
    on("invoice-filter-doctype", "change", renderInvoicesTable);
    on("invoice-filter-from", "change", renderInvoicesTable);
    on("invoice-filter-to", "change", renderInvoicesTable);
    on("invoice-filter-clear", "click", () => {
      const ids = [
        "invoice-search",
        "invoice-filter-employee",
        "invoice-filter-doctype",
        "invoice-filter-from",
        "invoice-filter-to",
      ];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      renderInvoicesTable();
    });

    // Toggle today vs all invoices
    on("btn-view-all-invoices", "click", () => setInvoicesViewMode(true));
    on("btn-back-to-today", "click", () => setInvoicesViewMode(false));

    // Monthly report PDF download
    on("btn-download-monthly-report", "click", downloadMonthlyReport);

    // Purchasing / Suppliers
    on("btn-new-supplier", "click", () => openSupplierModal());
    on("btn-show-all-purchases", "click", () => {
      const hist = $("#purchase-history-section");
      const sup  = $("#suppliers-list-section");
      if (!hist) return;
      hist.classList.remove("hidden");
      if (sup) sup.classList.add("hidden");
      renderPurchasesHistory();
      hist.scrollIntoView({ behavior: "smooth" });
    });
    on("btn-back-to-suppliers", "click", () => {
      const hist = $("#purchase-history-section");
      const sup  = $("#suppliers-list-section");
      if (hist) hist.classList.add("hidden");
      if (sup) {
        sup.classList.remove("hidden");
        sup.scrollIntoView({ behavior: "smooth" });
      }
    });
    on("supplier-search", "input", renderSuppliersList);

    // Returns
    on("btn-new-customer-return", "click", () => openNewReturnModal("customer"));
    on("btn-new-supplier-return", "click", () => openNewReturnModal("supplier"));
    on("returns-search", "input", renderReturnsView);
    document.querySelectorAll(".tab-filter-btn[data-ret-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-filter-btn[data-ret-tab]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderReturnsView();
      });
    });
    on("btn-cancel-purchase", "click", hidePurchaseForm);
    on("btn-save-purchase", "click", savePurchase);
    on("btn-add-purchase-item", "click", addPurchaseItem);

    // Auto price calculation when cost price is entered
    document.getElementById("purchase-item-cost")?.addEventListener("input", autofillPricesFromCost);
    on("purchase-search", "input", renderPurchasesHistory);
    on("btn-change-purchase-supplier", "click", () => {
      const bar = $("#purchase-supplier-info-bar");
      if (bar) bar.style.display = "none";
      const selGroup = $("#purchase-supplier-select-group");
      if (selGroup) selGroup.style.display = "";
      if ($("#purchase-supplier-id")) $("#purchase-supplier-id").value = "";
    });
    on("purchase-modal-close", "click", () =>
      $("#purchase-modal")?.classList.add("hidden"),
    );

    // Backup
    on("btn-backup", "click", async () => {
      const btn = document.getElementById("btn-backup");
      const label = document.getElementById("backup-label");
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      if (label) label.textContent = "Backing up...";
      try {
        const res = await fetch("/api/backup/run", { method: "POST", headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") } });
        const data = await res.json();
        if (data.ok) {
          const t = data.time ? new Date(data.time).toLocaleString() : "";
          alert(`✅ Backup successful!\n📁 ${data.file || ""}\n🕒 ${t}`);
          if (label) label.textContent = "Backup Now";
        } else {
          alert(`❌ Backup failed: ${data.error || "Unknown error"}`);
          if (label) label.textContent = "Backup Now";
        }
      } catch (e) {
        alert(`❌ Backup error: ${e.message}`);
        if (label) label.textContent = "Backup Now";
      } finally {
        btn.disabled = false;
      }
    });

    on("btn-restore", "click", async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip,.json,application/zip,application/json";
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const btn = document.getElementById("btn-restore");
        const label = document.getElementById("restore-label");
        if (btn) btn.disabled = true;
        if (label) label.textContent = "Restoring...";
        try {
          const res = await fetch("/api/backup/restore", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream", "x-pos-token": (localStorage.getItem("pos_token") || "") },
            body: await file.arrayBuffer(),
          });
          const data = await res.json();
          if (data.ok) {
            alert("✅ Restore complete");
            await loadAllData();
            updateDashboard();
            renderProductsTable();
            renderCustomersTable();
            renderExpensesTable();
            renderPurchasesHistory();
          } else {
            alert(`❌ Restore failed: ${data.error || "Unknown error"}`);
          }
        } catch (e) {
          alert(`❌ Restore error: ${e.message}`);
        } finally {
          if (btn) btn.disabled = false;
          if (label) label.textContent = "Restore Backup";
        }
      };
      input.click();
    });

    // Access control
    applyAccessControl();

    // Settings
    on("btn-save-settings", "click", saveSettingsData);

    // GitHub backup
    on("btn-github-test", "click", testGithubBackup);
    on("btn-github-backup-now", "click", runGithubBackupNow);
    on("btn-github-list", "click", listGithubBackups);

    // Template previews
    on("btn-preview-invoice", "click", () => previewTemplate("invoice"));
    on("btn-preview-receipt", "click", () => previewTemplate("receipt"));
    document.querySelectorAll(".settings-tab").forEach((tab) => {
      tab.addEventListener("click", function () {
        document
          .querySelectorAll(".settings-tab")
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(".settings-panel")
          .forEach((p) => p.classList.remove("active"));
        this.classList.add("active");
        const panel = document.getElementById("stab-" + this.dataset.tab);
        if (panel) panel.classList.add("active");
        if (this.dataset.tab === "employers") loadEmployersTable();
        if (this.dataset.tab === "theme") refreshThemeCards();
      });
    });

    document.querySelectorAll(".theme-card[data-theme-pick]").forEach((card) => {
      card.addEventListener("click", function () {
        const theme = this.dataset.themePick;
        applyTheme(theme);
        showAppToast("Theme changed to " + getThemeName(theme) + "!", "#7c3aed");
      });
    });

    document.querySelectorAll(".fontsize-card[data-fontsize-pick]").forEach((card) => {
      card.addEventListener("click", function () {
        const size = this.dataset.fontsizePick;
        applyFontSize(size);
        showAppToast("Text size set to " + getFontSizeName(size) + "!", "#0ea5e9");
      });
    });

    // Return modal
    on("return-modal-cancel",  "click", closeReturnModal);
    on("return-modal-confirm", "click", processReturn);

    // Employer modal
    on("btn-add-employer", "click", openAddEmployerModal);
    on("emp-modal-cancel", "click", closeEmployerModal);
    on("emp-modal-save", "click", saveEmployer);
    const empRoleSelect = document.getElementById("emp-role");
    if (empRoleSelect) {
      empRoleSelect.addEventListener("change", function () {
        const preset = ROLE_PRESETS[this.value] || [];
        setEmpPermissions(preset);
      });
    }

    // General
    on("btn-seed", "click", seedSampleData);
    on("btn-clear-data", "click", clearAllData);
    on("btn-logout", "click", logout);

    // Internal Chat
    on("btn-internal-chat", "click", () => {
      const panel = document.getElementById("chat-panel");
      if (panel && !panel.classList.contains("hidden")) {
        closeChatPanel();
      } else {
        openChatPanel();
      }
    });

    // Start background heartbeat (even when chat is closed, to track online status)
    setInterval(() => {
      if (document.visibilityState !== "hidden") {
        fetch("/api/chat/heartbeat", { method: "POST", headers: { "x-pos-token": _tok() } }).catch(() => {});
      }
    }, 25000);
    fetch("/api/chat/heartbeat", { method: "POST", headers: { "x-pos-token": _tok() } }).catch(() => {});

    // Populate category filter
    const catSelect = $("#product-category-filter");
    if (catSelect) {
      categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
      });
    }

    // Initialize views
    renderProductsTable();
    renderCustomersTable();
    renderExpensesTable();
    renderPurchasesHistory();
    updateDashboard();
    switchView(firstAllowedView());
  } catch (err) {
    console.error("Zyphra POS init error:", err);
  }
});

// ============================================================
// ============= NEW FEATURES (v2 EXPANSION) ==================
// ============================================================
// Adds: Inventory enhancements, Barcode, Warranty, Quotations,
//       Cash Drawer, Loyalty, AI Insights
// ============================================================

let appSettingsCache = null;
async function loadAppSettings() {
  try {
    const r = await fetch("/api/settings");
    appSettingsCache = await r.json();
  } catch {
    appSettingsCache = {};
  }
  return appSettingsCache;
}

function getLoyaltyConfig() {
  const s = appSettingsCache || {};
  return {
    enabled: s.loyaltyEnabled !== false, // default ON
    earnRate: Number(s.loyaltyEarnRate) || 100, // 1 pt per Rs 100
    redeemRate: Number(s.loyaltyRedeemRate) || 50, // 100 pts = Rs 50
  };
}

async function saveLoyaltyConfig(cfg) {
  const r = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      loyaltyEnabled: !!cfg.enabled,
      loyaltyEarnRate: cfg.earnRate,
      loyaltyRedeemRate: cfg.redeemRate,
    }),
  });
  const d = await r.json();
  if (d.ok) {
    appSettingsCache = d.settings;
  }
  return d;
}

// ==================== BARCODE PRINT ====================
function openBarcodePrintWindow(p) {
  if (!p) return;
  openBarcodeLabelModal([p]);
}

// ── Batch Barcode Label Modal ────────────────────────────────
function openBarcodeLabelModal(preSelected) {
  const modal = $("#barcode-label-modal");
  if (!modal) return;
  modal.classList.remove("hidden");

  const list = $("#lbl-product-list");
  if (!list) return;
  list.innerHTML = "";

  const preSel = new Set((preSelected || []).map((p) => p.id));

  products.forEach((p) => {
    const code = p.barcode || p.sku || p.id;
    const checked = preSel.size > 0 ? preSel.has(p.id) : true;
    const row = document.createElement("label");
    row.className = "lbl-prod-row";
    row.dataset.name = (p.name + " " + (p.sku || "") + " " + (p.barcode || "")).toLowerCase();
    row.innerHTML = `
      <input type="checkbox" class="lbl-chk" data-id="${p.id}" ${checked ? "checked" : ""} style="flex-shrink:0;width:auto;" />
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#f3f4f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:1px;">${escapeHtml(code)} &nbsp;|&nbsp; ${fmtCurrency(p.price)}</div>
      </div>`;
    row.addEventListener("change", updateLabelCount);
    list.appendChild(row);
  });

  updateLabelCount();
}

function filterLabelProducts() {
  const q = ($("#lbl-search")?.value || "").toLowerCase();
  document.querySelectorAll(".lbl-prod-row").forEach((row) => {
    row.style.display = !q || row.dataset.name.includes(q) ? "" : "none";
  });
}

function selectAllLabelProducts(checked) {
  document.querySelectorAll(".lbl-chk").forEach((cb) => {
    const row = cb.closest(".lbl-prod-row");
    if (!row || row.style.display === "none") return;
    cb.checked = checked;
  });
  updateLabelCount();
}

function updateLabelCount() {
  const n = document.querySelectorAll(".lbl-chk:checked").length;
  const copies = Math.max(1, parseInt($("#lbl-copies")?.value || "1"));
  const total  = n * copies;
  const el  = $("#lbl-selected-count");
  const el2 = $("#lbl-total-count");
  if (el)  el.textContent  = `${n} product${n !== 1 ? "s" : ""} selected`;
  if (el2) el2.textContent = total > 0 ? `${total} label${total !== 1 ? "s" : ""} total` : "";
}

// ---- Label Preset helper ----
function applyLabelPreset(preset) {
  const sizeEl  = $("#lbl-size");
  const colsEl  = $("#lbl-cols");
  const tmplEl  = $("#lbl-template");
  const bizEl   = $("#lbl-show-bizname");
  const nameEl  = $("#lbl-show-name");
  const priceEl = $("#lbl-show-price");
  const skuEl   = $("#lbl-show-sku");
  const presets = {
    "thermal-small": { size:"38x25",  cols:"1", tmpl:"minimal",  biz:false, name:true,  price:true,  sku:false },
    "thermal-std":   { size:"57x32",  cols:"1", tmpl:"standard", biz:true,  name:true,  price:true,  sku:true  },
    "thermal-wide":  { size:"80x40",  cols:"1", tmpl:"detailed", biz:true,  name:true,  price:true,  sku:true  },
    "a4-sheet":      { size:"63x38",  cols:"3", tmpl:"standard", biz:true,  name:true,  price:true,  sku:true  },
  };
  const p = presets[preset]; if (!p) return;
  if (sizeEl)  sizeEl.value  = p.size;
  if (colsEl)  colsEl.value  = p.cols;
  if (tmplEl)  tmplEl.value  = p.tmpl;
  if (bizEl)   bizEl.checked   = p.biz;
  if (nameEl)  nameEl.checked  = p.name;
  if (priceEl) priceEl.checked = p.price;
  if (skuEl)   skuEl.checked   = p.sku;
  updateLabelCount();
}

function printBarcodeLabels() {
  const selectedIds = new Set(
    [...document.querySelectorAll(".lbl-chk:checked")].map((cb) => cb.dataset.id)
  );
  if (selectedIds.size === 0) { alert("Select at least one product."); return; }

  const sizeVal  = $("#lbl-size")?.value  || "57x32";
  const cols     = parseInt($("#lbl-cols")?.value  || "1");
  const copies   = Math.max(1, parseInt($("#lbl-copies")?.value || "1"));
  const template = $("#lbl-template")?.value || "standard";
  const showName = $("#lbl-show-name")?.checked !== false;
  const showPrice= $("#lbl-show-price")?.checked !== false;
  const showSku  = $("#lbl-show-sku")?.checked !== false;
  const showBiz  = $("#lbl-show-bizname")?.checked !== false;

  const [lw, lh] = sizeVal.split("x").map(Number);
  const bizName  = L("businessName", "") || L("appName", "");
  const currency = L("currency", "Rs.");

  const selected = products.filter((p) => selectedIds.has(p.id));
  const labelItems = [];
  selected.forEach((p) => { for (let i = 0; i < copies; i++) labelItems.push(p); });

  // Thermal-optimised dimensions
  const isSmall  = lw <= 50;
  const isMini   = lw <= 38;
  const bcHeight = isMini ? Math.round(lh * 1.1) : isSmall ? Math.round(lh * 1.3) : Math.round(lh * 1.5);
  const bcWidth  = isMini ? 0.9 : isSmall ? 1.1 : lw >= 80 ? 1.8 : 1.4;
  const fnBiz    = isMini ? 6  : isSmall ? 7  : lw >= 80 ? 9  : 8;
  const fnName   = isMini ? 7  : isSmall ? 8  : lw >= 80 ? 11 : 9;
  const fnPrice  = template === "price-tag" ? (isMini ? 11 : isSmall ? 13 : lw >= 80 ? 18 : 15)
                                            : (isMini ? 8  : isSmall ? 9  : lw >= 80 ? 13 : 11);
  const fnSku    = isMini ? 5  : isSmall ? 6  : 7;

  const labelsHTML = labelItems.map((p, idx) => {
    const code = (p.barcode || p.sku || p.id);
    const safeCode = code.replace(/[^A-Za-z0-9\-\.\ \$\/\+\%]/g, "").trim() || String(idx + 1);
    const priceStr = `${currency} ${Number(p.price).toFixed(2)}`;

    if (template === "price-tag") {
      return `<div class="label" id="lb${idx}">
        ${showBiz  ? `<div class="biz">${escapeHtml(bizName)}</div>` : ""}
        ${showName ? `<div class="pname">${escapeHtml(p.name)}</div>` : ""}
        <svg id="bc${idx}" class="bcsvg"></svg>
        <div class="price-big">${escapeHtml(priceStr)}</div>
        ${showSku  ? `<div class="sku">${escapeHtml(safeCode)}</div>` : ""}
      </div>`;
    }
    if (template === "minimal") {
      return `<div class="label" id="lb${idx}">
        <svg id="bc${idx}" class="bcsvg"></svg>
        ${showPrice ? `<div class="price">${escapeHtml(priceStr)}</div>` : ""}
      </div>`;
    }
    // standard / detailed
    return `<div class="label" id="lb${idx}">
      ${showBiz  ? `<div class="biz">${escapeHtml(bizName)}</div>` : ""}
      ${showName ? `<div class="pname">${escapeHtml(p.name)}</div>` : ""}
      <svg id="bc${idx}" class="bcsvg"></svg>
      ${showPrice ? `<div class="price">${escapeHtml(priceStr)}</div>` : ""}
      ${showSku   ? `<div class="sku">${escapeHtml(safeCode)}</div>` : ""}
    </div>`;
  }).join("");

  const barcodeScripts = labelItems.map((p, idx) => {
    const code = (p.barcode || p.sku || p.id);
    const safeCode = code.replace(/[^A-Za-z0-9\-\.\ \$\/\+\%]/g, "").trim() || String(idx + 1);
    return `try{ JsBarcode("#bc${idx}", ${JSON.stringify(safeCode)}, {format:"CODE128",width:${bcWidth},height:${bcHeight},displayValue:false,margin:1}); }catch(e){ document.getElementById("bc${idx}").outerHTML='<span style="color:red;font-size:8px;">ERR</span>'; }`;
  }).join("\n");

  const printWin = window.open("", "_blank", "width=960,height=720");
  if (!printWin) { alert("Pop-up blocked — please allow pop-ups."); return; }

  printWin.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Barcode Labels — ${labelItems.length}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Arial Narrow',Arial,sans-serif;background:#e5e7eb;padding:8mm;}
  /* ── toolbar (hidden on print) ── */
  .toolbar{background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:10px 18px;margin-bottom:8mm;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .toolbar h2{flex:1;font-size:14px;font-weight:700;color:#1f2937;}
  .toolbar button{padding:7px 18px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;}
  .toolbar .info{font-size:12px;color:#6b7280;background:#f3f4f6;padding:4px 10px;border-radius:4px;}
  /* ── label grid ── */
  .grid{display:grid;grid-template-columns:repeat(${cols}, ${lw}mm);gap:${cols > 1 ? "2mm" : "3mm"};justify-content:start;}
  /* ── individual label ── */
  .label{
    width:${lw}mm; height:${lh}mm;
    border:0.3mm solid #999;
    border-radius:1mm;
    padding:1mm 1.2mm;
    display:flex; flex-direction:column;
    align-items:center; justify-content:space-evenly;
    background:#fff;
    page-break-inside:avoid;
    overflow:hidden;
    gap:0;
  }
  .biz{font-size:${fnBiz}px;color:#444;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;line-height:1.1;border-bottom:0.2mm solid #ddd;padding-bottom:0.5mm;}
  .pname{font-size:${fnName}px;font-weight:700;text-align:center;line-height:1.15;overflow:hidden;width:100%;display:-webkit-box;-webkit-line-clamp:${isMini ? 1 : 2};-webkit-box-orient:vertical;}
  .bcsvg{max-width:${lw - 3}mm;display:block;flex-shrink:0;}
  .price{font-size:${fnPrice}px;font-weight:800;color:#000;text-align:center;letter-spacing:-0.02em;line-height:1.1;}
  .price-big{font-size:${fnPrice}px;font-weight:900;color:#000;text-align:center;letter-spacing:-0.03em;border-top:0.3mm solid #333;width:100%;padding-top:0.5mm;line-height:1.1;}
  .sku{font-size:${fnSku}px;color:#666;text-align:center;letter-spacing:0.03em;line-height:1.1;}
  /* ── print ── */
  @media print{
    body{padding:3mm;background:#fff;}
    .toolbar{display:none;}
    .grid{gap:${cols > 1 ? "1.5mm" : "2mm"};}
    .label{border-color:#888;}
  }
</style>
</head><body>
<div class="toolbar">
  <h2>🏷 Barcode Labels</h2>
  <span class="info">${labelItems.length} label${labelItems.length !== 1 ? "s" : ""} &nbsp;|&nbsp; ${lw}×${lh} mm &nbsp;|&nbsp; ${cols} col${cols !== 1 ? "s" : ""}</span>
  <button onclick="window.print()" style="background:#059669;">🖨&nbsp; Print Now</button>
  <button onclick="window.close()" style="background:#374151;">✕ Close</button>
</div>
<div class="grid">${labelsHTML}</div>
<script>
window.addEventListener("load", function() {
  ${barcodeScripts}
  // Auto-trigger print after 800ms for thermal printers
  // Uncomment below line if you want auto-print:
  // setTimeout(function(){ window.print(); }, 800);
});
<\/script>
</body></html>`);
  printWin.document.close();
  $("#barcode-label-modal")?.classList.add("hidden");
}

// ==================== LOYALTY: BILLING CARD ====================
function updateBillingLoyaltyCard() {
  const card = $("#billing-loyalty-card");
  if (!card) return;
  const cfg = getLoyaltyConfig();
  const cust = customers.find((c) => c.id === selectedBillingCustomerId);
  if (!cfg.enabled || !cust) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const pts = Number(cust.loyaltyPoints) || 0;
  $("#bl-points").textContent = pts.toLocaleString();
  const cashValue = Math.floor(pts / 100) * cfg.redeemRate;
  $("#bl-cash-value").textContent = fmtCurrency(cashValue);
  $("#bl-redeem-input").max = pts;
  $("#bl-redeem-input").placeholder = `Max ${pts} pts`;
}

// ==================== LOYALTY VIEW ====================
function renderLoyaltyView() {
  const cfg = getLoyaltyConfig();
  const tbody = $("#loyalty-tbody");
  const stats = $("#loyalty-stats");
  if (!tbody) return;

  const spentByCust = {};
  invoices.forEach((i) => {
    if (!i.customer) return;
    spentByCust[i.customer] = (spentByCust[i.customer] || 0) + (Number(i.total) || 0);
  });

  const enriched = customers.map((c) => ({
    ...c,
    points: Number(c.loyaltyPoints) || 0,
    spent: spentByCust[c.id] || 0,
    cashValue: Math.floor((Number(c.loyaltyPoints) || 0) / 100) * cfg.redeemRate,
  }));

  if (stats) {
    const totalPts = enriched.reduce((s, c) => s + c.points, 0);
    const activeMembers = enriched.filter((c) => c.points > 0).length;
    const totalCash = enriched.reduce((s, c) => s + c.cashValue, 0);
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-card-icon" style="background:#fef3c7;color:#d97706;"><i class="fa fa-star"></i></div>
        <div><div class="stat-label">Active Members</div><div class="stat-value">${activeMembers}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#fce7f3;color:#db2777;"><i class="fa fa-coins"></i></div>
        <div><div class="stat-label">Total Points Issued</div><div class="stat-value">${totalPts.toLocaleString()}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#dcfce7;color:#16a34a;"><i class="fa fa-money-bill"></i></div>
        <div><div class="stat-label">Redeemable Value</div><div class="stat-value">${fmtCurrency(totalCash)}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:${cfg.enabled ? "#dbeafe;color:#2563eb" : "#1f2937;color:#6b7280"};"><i class="fa fa-toggle-${cfg.enabled ? "on" : "off"}"></i></div>
        <div><div class="stat-label">Program Status</div><div class="stat-value" style="color:${cfg.enabled ? "#60a5fa" : "#6b7280"};">${cfg.enabled ? "Active" : "Inactive"}</div></div></div>
    `;
  }

  const search = ($("#loyalty-search")?.value || "").toLowerCase().trim();
  const sort = $("#loyalty-sort")?.value || "points-desc";

  let rows = enriched.filter((c) =>
    !search || c.name.toLowerCase().includes(search) || (c.phone || "").includes(search),
  );
  if (sort === "points-desc") rows.sort((a, b) => b.points - a.points);
  else if (sort === "points-asc") rows.sort((a, b) => a.points - b.points);
  else rows.sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted);"><i class="fa fa-star" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.3;"></i>No customers found</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((c, idx) => {
    const rank = idx + 1;
    const rankCls = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "rank-other";
    const rankLabel = rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : rank;
    const initials = c.name.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return `
      <tr>
        <td><span class="rank-badge ${rankCls}">${rankLabel}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="cust-avatar-sm">${initials}</span>
            <div class="cell-name-sub">
              <span class="cname">${escapeHtml(c.name)}</span>
              ${c.email ? `<span class="csub">${escapeHtml(c.email)}</span>` : ""}
            </div>
          </div>
        </td>
        <td style="color:var(--muted);font-size:13px;">${escapeHtml(c.phone || "—")}</td>
        <td><span class="pts-pill"><i class="fa fa-star"></i>${c.points.toLocaleString()} pts</span></td>
        <td style="color:#4ade80;font-weight:600;">${fmtCurrency(c.cashValue)}</td>
        <td style="color:var(--muted);font-size:13px;">${fmtCurrency(c.spent)}</td>
        <td><div class="action-btns">
          <button class="sec-action-btn ab-view loy-view-cust" data-id="${c.id}"><i class="fa fa-user"></i> <span>View</span></button>
          <button class="sec-action-btn ab-adj loy-adj" data-id="${c.id}"><i class="fa fa-sliders-h"></i> <span>Adjust</span></button>
        </div></td>
      </tr>
    `;
  }).join("");

  qsa(".loy-view-cust").forEach((b) =>
    b.addEventListener("click", (e) => openCustomerInfoModal(e.target.closest("[data-id]").dataset.id)),
  );
  qsa(".loy-adj").forEach((b) =>
    b.addEventListener("click", (e) => {
      const cust = customers.find((c) => c.id === e.target.closest("[data-id]").dataset.id);
      if (!cust) return;
      const cur = Number(cust.loyaltyPoints) || 0;
      const v = prompt(`Adjust loyalty points for ${cust.name}\nCurrent: ${cur}\nEnter new total:`, cur);
      if (v === null) return;
      const n = Math.max(0, Math.floor(Number(v)));
      if (Number.isNaN(n)) return alert("Invalid number");
      cust.loyaltyPoints = n;
      saveAllData();
      renderLoyaltyView();
      showAppToast(`✅ Updated ${cust.name} → ${n} pts`, "#16a34a");
    }),
  );
}

// ==================== WARRANTIES VIEW ====================
function getWarrantyRecords() {
  // Derive warranties from invoices: each line item with serialNo + product with warrantyMonths
  const records = [];
  invoices.forEach((inv) => {
    (inv.items || []).forEach((it) => {
      const sn = (it.serialNo || "").trim();
      if (!sn) return;
      const product = products.find((p) => p.id === it.id || p.sku === it.sku);
      const warrantyMonths = Number(product?.warrantyMonths) || 0;
      if (warrantyMonths <= 0) return;
      const sold = new Date(inv.date);
      const expires = new Date(sold);
      expires.setMonth(expires.getMonth() + warrantyMonths);
      const now = new Date();
      const daysLeft = Math.ceil((expires - now) / 86400000);
      let status = "active";
      if (daysLeft < 0) status = "expired";
      else if (daysLeft <= 30) status = "expiring";
      const customer = inv.customer ? customers.find((c) => c.id === inv.customer) : null;
      records.push({
        productName: it.name,
        productId: it.id,
        serial: sn,
        customer: customer || null,
        soldDate: inv.date,
        expires: expires.toISOString(),
        daysLeft,
        status,
        invoiceId: inv.id,
        warrantyMonths,
      });
    });
  });
  return records;
}

function renderWarrantiesView() {
  const tbody = $("#warranties-tbody");
  const stats = $("#warranty-stats");
  if (!tbody) return;
  const all = getWarrantyRecords();

  if (stats) {
    const active = all.filter((w) => w.status === "active").length;
    const expiring = all.filter((w) => w.status === "expiring").length;
    const expired = all.filter((w) => w.status === "expired").length;
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-card-icon" style="background:#dcfce7;color:#16a34a;"><i class="fa fa-shield-alt"></i></div>
        <div><div class="stat-label">Active Warranties</div><div class="stat-value">${active}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#fef3c7;color:#d97706;"><i class="fa fa-clock"></i></div>
        <div><div class="stat-label">Expiring Soon (30d)</div><div class="stat-value">${expiring}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#fee2e2;color:#dc2626;"><i class="fa fa-times-circle"></i></div>
        <div><div class="stat-label">Expired</div><div class="stat-value">${expired}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#dbeafe;color:#2563eb;"><i class="fa fa-list"></i></div>
        <div><div class="stat-label">Total Records</div><div class="stat-value">${all.length}</div></div></div>
    `;
  }

  const search = ($("#warranty-search")?.value || "").toLowerCase().trim();
  const filter = $("#warranty-status-filter")?.value || "all";
  let rows = all.filter((w) => {
    if (filter !== "all" && w.status !== filter) return false;
    if (search) {
      const hay = [w.productName, w.serial, w.customer?.name || "", w.customer?.phone || "", w.invoiceId].join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  rows.sort((a, b) => new Date(b.soldDate) - new Date(a.soldDate));

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted);">No warranty records found. Add a warranty period to a product, then sell it with a serial number.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((w) => {
    const badge = w.status === "active"
      ? `<span class="warranty-badge wb-active"><i class="fa fa-shield-alt"></i> ${w.daysLeft}d left</span>`
      : w.status === "expiring"
      ? `<span class="warranty-badge wb-expiring"><i class="fa fa-clock"></i> ${w.daysLeft}d left</span>`
      : `<span class="warranty-badge wb-expired"><i class="fa fa-times-circle"></i> Expired</span>`;
    const custInitials = w.customer ? w.customer.name.trim().split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase() : "";
    return `
      <tr>
        <td><div class="cell-name-sub"><span class="cname">${escapeHtml(w.productName)}</span><span class="csub">${w.warrantyMonths}mo warranty</span></div></td>
        <td><span class="code-chip">${escapeHtml(w.serial)}</span></td>
        <td>${w.customer
          ? `<div style="display:flex;align-items:center;gap:8px;"><span class="cust-avatar-sm" style="width:28px;height:28px;font-size:11px;">${custInitials}</span><span style="font-size:13px;">${escapeHtml(w.customer.name)}</span></div>`
          : `<span style="color:var(--muted);">—</span>`}</td>
        <td style="color:var(--muted);font-size:13px;">${new Date(w.soldDate).toLocaleDateString()}</td>
        <td style="font-size:13px;${w.status === "expired" ? "color:#f87171;" : w.status === "expiring" ? "color:#fbbf24;" : "color:#4ade80;"}">${new Date(w.expires).toLocaleDateString()}</td>
        <td>${badge}</td>
        <td><span class="code-chip">${escapeHtml(w.invoiceId)}</span></td>
      </tr>
    `;
  }).join("");
}

function openWarrantyLookupModal() {
  $("#warranty-lookup-input").value = "";
  $("#warranty-lookup-result").innerHTML = "";
  $("#warranty-lookup-modal")?.classList.remove("hidden");
  setTimeout(() => $("#warranty-lookup-input")?.focus(), 100);
}

function doWarrantyLookup() {
  const q = ($("#warranty-lookup-input")?.value || "").toLowerCase().trim();
  const out = $("#warranty-lookup-result");
  if (!q) {
    out.innerHTML = `<div style="color:var(--muted);font-size:13px;">Type something to search…</div>`;
    return;
  }
  const all = getWarrantyRecords();
  const matches = all.filter((w) => {
    const hay = [w.productName, w.serial, w.customer?.name || "", w.customer?.phone || "", w.invoiceId].join(" ").toLowerCase();
    return hay.includes(q);
  });
  if (matches.length === 0) {
    out.innerHTML = `<div style="color:var(--danger);font-size:14px;padding:10px;background:rgba(220,38,38,0.08);border-radius:6px;">❌ No matching warranty found</div>`;
    return;
  }
  out.innerHTML = matches.slice(0, 5).map((w) => {
    const statusColor = w.status === "active" ? "#16a34a" : w.status === "expiring" ? "#d97706" : "#dc2626";
    return `
      <div style="border-left:3px solid ${statusColor};padding:10px;margin:8px 0;background:rgba(99,102,241,0.05);border-radius:6px;font-size:13px;">
        <div><strong>${escapeHtml(w.productName)}</strong></div>
        <div>Serial: <code>${escapeHtml(w.serial)}</code></div>
        <div>Customer: ${w.customer ? escapeHtml(w.customer.name) : "—"}</div>
        <div>Sold: ${new Date(w.soldDate).toLocaleDateString()} → Expires: ${new Date(w.expires).toLocaleDateString()}</div>
        <div style="color:${statusColor};font-weight:600;margin-top:4px;">
          ${w.status === "active" ? `✅ Under warranty (${w.daysLeft} days left)` :
            w.status === "expiring" ? `⚠️ Expiring soon (${w.daysLeft} days)` :
            `❌ Expired ${Math.abs(w.daysLeft)} days ago`}
        </div>
      </div>
    `;
  }).join("");
}

// ==================== QUOTATIONS ====================
function renderQuotationsView() {
  const tbody = $("#quotations-tbody");
  const stats = $("#quote-stats");
  if (!tbody) return;

  // Auto-mark expired
  const now = new Date();
  let mutated = false;
  quotations.forEach((q) => {
    if (q.status === "draft" || q.status === "sent") {
      if (q.validUntil && new Date(q.validUntil) < now) {
        q.status = "expired";
        mutated = true;
      }
    }
  });
  if (mutated) saveAllData();

  if (stats) {
    const sent = quotations.filter((q) => q.status === "sent").length;
    const accepted = quotations.filter((q) => q.status === "accepted" || q.status === "converted").length;
    const totalValue = quotations.filter((q) => ["sent", "draft"].includes(q.status))
      .reduce((s, q) => s + (Number(q.total) || 0), 0);
    const expired = quotations.filter((q) => q.status === "expired").length;
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-card-icon" style="background:#dbeafe;color:#2563eb;"><i class="fa fa-paper-plane"></i></div>
        <div><div class="stat-label">Active Quotes</div><div class="stat-value">${sent}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#dcfce7;color:#16a34a;"><i class="fa fa-check"></i></div>
        <div><div class="stat-label">Accepted/Converted</div><div class="stat-value">${accepted}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#fef3c7;color:#d97706;"><i class="fa fa-coins"></i></div>
        <div><div class="stat-label">Pipeline Value</div><div class="stat-value">${fmtCurrency(totalValue)}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:#fee2e2;color:#dc2626;"><i class="fa fa-times-circle"></i></div>
        <div><div class="stat-label">Expired</div><div class="stat-value">${expired}</div></div></div>
    `;
  }

  const search = ($("#quote-search")?.value || "").toLowerCase().trim();
  const status = $("#quote-status-filter")?.value || "all";

  let rows = quotations.filter((q) => {
    if (status !== "all" && q.status !== status) return false;
    if (search) {
      const hay = [q.id, q.customerName || "", q.customerPhone || ""].join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--muted);">No quotations found. Click "New Quotation" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((q) => {
    const statusBadge = `<span class="quote-status qs-${q.status}">${q.status}</span>`;
    const custInitials = (q.customerName || "?").trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    const itemCount = (q.items || []).length;
    const isConvertible = ["draft","sent","accepted"].includes(q.status);
    return `
      <tr>
        <td><span class="code-chip">${escapeHtml(q.id)}</span></td>
        <td style="color:var(--muted);font-size:13px;">${new Date(q.date).toLocaleDateString()}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="cust-avatar-sm" style="width:30px;height:30px;font-size:11px;">${custInitials}</span>
            <div class="cell-name-sub">
              <span class="cname">${escapeHtml(q.customerName || "—")}</span>
              ${q.customerPhone ? `<span class="csub">${escapeHtml(q.customerPhone)}</span>` : ""}
            </div>
          </div>
        </td>
        <td style="color:var(--muted);font-size:13px;text-align:center;">${itemCount}</td>
        <td class="amt-yel">${fmtCurrency(q.total)}</td>
        <td style="font-size:13px;${q.validUntil && new Date(q.validUntil) < new Date() ? "color:#f87171;" : "color:var(--muted);"}">${q.validUntil ? new Date(q.validUntil).toLocaleDateString() : "—"}</td>
        <td>${statusBadge}</td>
        <td><div class="action-btns">
          <button class="sec-action-btn ab-view q-view" data-id="${q.id}"><i class="fa fa-eye"></i> <span>View</span></button>
          <button class="sec-action-btn ab-pdf q-pdf" data-id="${q.id}"><i class="fa fa-file-pdf"></i> <span>PDF</span></button>
          <button class="sec-action-btn ab-wa q-wa" data-id="${q.id}"><i class="fa fa-comment"></i> <span>WA</span></button>
          ${isConvertible ? `<button class="sec-action-btn ab-conv q-conv" data-id="${q.id}"><i class="fa fa-exchange-alt"></i> <span>Invoice</span></button>` : ""}
          <button class="sec-action-btn ab-del q-del" data-id="${q.id}"><i class="fa fa-trash"></i></button>
        </div></td>
      </tr>
    `;
  }).join("");

  qsa(".q-view").forEach((b) => b.addEventListener("click", (e) => previewQuotation(e.target.closest("[data-id]").dataset.id)));
  qsa(".q-pdf").forEach((b) => b.addEventListener("click", (e) => downloadQuotationPDF(e.target.closest("[data-id]").dataset.id)));
  qsa(".q-wa").forEach((b) => b.addEventListener("click", (e) => sendQuotationWA(e.target.closest("[data-id]").dataset.id)));
  qsa(".q-conv").forEach((b) => b.addEventListener("click", (e) => convertQuotationToInvoice(e.target.closest("[data-id]").dataset.id)));
  qsa(".q-del").forEach((b) => b.addEventListener("click", (e) => {
    if (!confirm("Delete this quotation?")) return;
    const id = e.target.closest("[data-id]").dataset.id;
    quotations = quotations.filter((q) => q.id !== id);
    saveAllData();
    renderQuotationsView();
  }));
}

function openQuotationModal() {
  editingQuotationId = null;
  quoteCart = [];
  $("#q-cust-name").value = "";
  $("#q-cust-phone").value = "";
  $("#q-valid-days").value = 7;
  $("#q-notes").value = "";
  $("#q-item-search").value = "";
  $("#q-item-qty").value = 1;
  // Populate datalist
  const dl = $("#q-search-suggestions");
  if (dl) dl.innerHTML = products.map((p) => `<option value="${escapeHtml(p.name)}">`).join("");
  renderQuoteItems();
  $("#quotation-modal")?.classList.remove("hidden");
}

function closeQuotationModal() {
  $("#quotation-modal")?.classList.add("hidden");
}

function renderQuoteItems() {
  const tbody = $("#q-items-tbody");
  if (!tbody) return;
  if (quoteCart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);">No items added yet</td></tr>`;
    $("#q-total").textContent = "Rs 0.00";
    return;
  }
  tbody.innerHTML = quoteCart.map((it, i) => `
    <tr>
      <td>${escapeHtml(it.name)}</td>
      <td><input type="number" min="1" value="${it.qty}" data-i="${i}" class="q-qty-in" style="width:60px;" /></td>
      <td>${fmtCurrency(it.price)}</td>
      <td><strong>${fmtCurrency(it.price * it.qty)}</strong></td>
      <td><button class="small danger q-rm-it" data-i="${i}">×</button></td>
    </tr>
  `).join("");
  const total = quoteCart.reduce((s, it) => s + it.price * it.qty, 0);
  $("#q-total").textContent = fmtCurrency(total);
  qsa(".q-qty-in").forEach((inp) => inp.addEventListener("change", (e) => {
    quoteCart[e.target.dataset.i].qty = Math.max(1, Number(e.target.value) || 1);
    renderQuoteItems();
  }));
  qsa(".q-rm-it").forEach((b) => b.addEventListener("click", (e) => {
    quoteCart.splice(Number(e.target.dataset.i), 1);
    renderQuoteItems();
  }));
}

function addItemToQuote() {
  const q = $("#q-item-search").value.toLowerCase().trim();
  if (!q) return;
  const p = products.find(
    (x) => x.name.toLowerCase() === q || x.sku.toLowerCase() === q ||
           x.name.toLowerCase().includes(q) || x.sku.toLowerCase().includes(q),
  );
  if (!p) return alert("Product not found");
  const qty = Math.max(1, Number($("#q-item-qty").value) || 1);
  const existing = quoteCart.find((i) => i.id === p.id);
  if (existing) existing.qty += qty;
  else quoteCart.push({ id: p.id, sku: p.sku, name: p.name, price: p.price, qty });
  $("#q-item-search").value = "";
  $("#q-item-qty").value = 1;
  renderQuoteItems();
}

function buildQuotationObject() {
  if (quoteCart.length === 0) {
    alert("Add at least one item");
    return null;
  }
  const customerName = $("#q-cust-name").value.trim();
  const customerPhone = $("#q-cust-phone").value.trim();
  const validDays = Math.max(1, Number($("#q-valid-days").value) || 7);
  const notes = $("#q-notes").value.trim();
  const total = quoteCart.reduce((s, it) => s + it.price * it.qty, 0);
  const date = new Date().toISOString();
  const validUntil = new Date(Date.now() + validDays * 86400000).toISOString();
  // Generate ID
  const existingIds = quotations.map((q) => {
    const m = q.id && q.id.match(/^QUO-(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  });
  const nextNum = (existingIds.length ? Math.max(...existingIds) : 0) + 1;
  const id = `QUO-${String(nextNum).padStart(4, "0")}`;
  return {
    id,
    date,
    validUntil,
    customerName,
    customerPhone,
    items: quoteCart.map((it) => ({ ...it, lineTotal: it.price * it.qty })),
    subtotal: total,
    total,
    notes,
    status: "draft",
    createdBy: currentUser || "unknown",
  };
}

function saveQuotation(status = "draft") {
  const q = buildQuotationObject();
  if (!q) return null;
  q.status = status;
  quotations.push(q);
  saveAllData();
  showAppToast(`✅ Quotation ${q.id} saved (${status})`, "#16a34a");
  return q;
}

function buildQuotationHTML(q) {
  const normalized = {
    ...q,
    docType: "quotation",
    soldBy: q.soldBy || q.createdBy || "—",
    itemDiscountTotal: q.itemDiscountTotal || 0,
    discountAmt: q.discountAmt || 0,
    taxPct: q.taxPct || 0,
    taxAmt: q.taxAmt || 0,
    paymentMethod: "quotation",
  };
  return buildDocumentHTML(normalized);
}

async function downloadQuotationPDF(id) {
  const q = quotations.find((x) => x.id === id);
  if (!q) return;
  showAppToast("📄 Generating PDF…", "#0ea5e9");
  try {
    const html = buildQuotationHTML(q);
    const r = await fetch("/api/invoice-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename: `${q.id}.pdf` }),
    });
    if (!r.ok) throw new Error("PDF generation failed");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${q.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showAppToast("✅ PDF downloaded", "#16a34a");
  } catch (e) {
    showAppToast("❌ " + e.message, "#dc2626");
  }
}

async function sendQuotationWA(id) {
  const q = quotations.find((x) => x.id === id);
  if (!q) return;
  if (!q.customerPhone) return alert("Customer phone number is required to send via WhatsApp");
  showAppToast("📤 Sending via WhatsApp…", "#0ea5e9");
  try {
    const r = await fetch("/api/whatsapp/send-invoice-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: q.customerPhone,
        html: buildQuotationHTML(q),
        invoiceId: q.id,
        invoice: { id: q.id, total: q.total, docType: "quotation" },
        customerName: q.customerName,
      }),
    });
    const d = await r.json();
    if (d.ok) {
      q.status = "sent";
      saveAllData();
      renderQuotationsView();
      showAppToast("✅ Quotation sent via WhatsApp", "#16a34a");
    } else throw new Error(d.error || "send failed");
  } catch (e) {
    showAppToast("❌ " + e.message, "#dc2626");
  }
}

function previewQuotation(id) {
  const q = quotations.find((x) => x.id === id);
  if (!q) return;
  const w = window.open("", "_blank", "width=720,height=820");
  if (!w) return alert("Pop-up blocked");
  w.document.write(buildQuotationHTML(q));
  w.document.close();
}

function convertQuotationToInvoice(id) {
  const q = quotations.find((x) => x.id === id);
  if (!q) return;
  if (!confirm(`Convert ${q.id} to an invoice? This will load the items into Billing.`)) return;
  // Load items into cart (replace current cart)
  cart = q.items.map((it) => ({
    id: it.id, sku: it.sku, name: it.name, price: it.price, qty: it.qty, discountPct: 0,
  }));
  // Try to match customer
  if (q.customerPhone) {
    const cust = customers.find((c) => (c.phone || "").replace(/\D/g, "").endsWith(q.customerPhone.replace(/\D/g, "").slice(-9)));
    if (cust) selectBillingCustomer(cust.id);
  }
  q.status = "converted";
  saveAllData();
  renderCart();
  switchView("billing");
  showAppToast(`✅ ${q.id} loaded into Billing — complete checkout to finalize`, "#16a34a");
}

// ==================== CASH DRAWER / SHIFTS ====================
function getCurrentShift() {
  return shifts.find((s) => !s.closedAt) || null;
}

function getShiftCashSales(shift) {
  if (!shift) return 0;
  const opened = new Date(shift.openedAt);
  const closed = shift.closedAt ? new Date(shift.closedAt) : new Date();
  return invoices
    .filter((i) => {
      const d = new Date(i.date);
      return i.paymentMethod === "cash" && d >= opened && d <= closed;
    })
    .reduce((s, i) => s + (Number(i.paidAmount) || Number(i.total) || 0), 0);
}

function renderCashDrawerView() {
  const card = $("#current-shift-card");
  const tbody = $("#shifts-tbody");
  if (!card || !tbody) return;

  const cur = getCurrentShift();
  if (cur) {
    const cashSales = getShiftCashSales(cur);
    const expected = (Number(cur.openingCash) || 0) + cashSales;
    const elapsed = Math.floor((new Date() - new Date(cur.openedAt)) / 60000);
    card.innerHTML = `
      <div class="shift-card open">
        <div class="shift-header">
          <h3><i class="fa fa-circle" style="color:#16a34a;animation:pulse 2s infinite;"></i> Active Shift</h3>
          <span class="shift-elapsed">${elapsed} min</span>
        </div>
        <div class="shift-grid">
          <div><div class="shift-label">Opened</div><div class="shift-value">${new Date(cur.openedAt).toLocaleString()}</div></div>
          <div><div class="shift-label">Cashier</div><div class="shift-value">${escapeHtml(cur.openedBy || "—")}</div></div>
          <div><div class="shift-label">Opening Cash</div><div class="shift-value">${fmtCurrency(cur.openingCash)}</div></div>
          <div><div class="shift-label">Cash Sales</div><div class="shift-value" style="color:#16a34a;">${fmtCurrency(cashSales)}</div></div>
          <div><div class="shift-label">Expected in Drawer</div><div class="shift-value" style="color:#0ea5e9;font-weight:700;">${fmtCurrency(expected)}</div></div>
        </div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <div class="shift-card closed">
        <i class="fa fa-door-closed" style="font-size:32px;color:var(--muted);"></i>
        <p>No active shift. Click "Open Shift" to start.</p>
      </div>
    `;
  }

  if (shifts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--muted);">No shift history yet</td></tr>`;
    return;
  }

  const sorted = [...shifts].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  tbody.innerHTML = sorted.map((s) => {
    const cashSales = getShiftCashSales(s);
    const expected = (Number(s.openingCash) || 0) + cashSales;
    const variance = s.closedAt ? (Number(s.countedCash) || 0) - expected : null;
    const varColor = variance == null ? "var(--muted)" : variance < 0 ? "#dc2626" : variance > 0 ? "#16a34a" : "var(--muted)";
    return `
      <tr>
        <td>${new Date(s.openedAt).toLocaleString()}</td>
        <td>${s.closedAt ? new Date(s.closedAt).toLocaleString() : "<strong style='color:#16a34a;'>OPEN</strong>"}</td>
        <td>${escapeHtml(s.openedBy || "—")}</td>
        <td>${fmtCurrency(s.openingCash)}</td>
        <td>${fmtCurrency(cashSales)}</td>
        <td>${fmtCurrency(expected)}</td>
        <td>${s.closedAt ? fmtCurrency(s.countedCash) : "—"}</td>
        <td><strong style="color:${varColor};">${variance == null ? "—" : fmtCurrency(variance)}</strong></td>
        <td style="font-size:11px;color:var(--muted);">${escapeHtml(s.notes || "")}</td>
      </tr>
    `;
  }).join("");
}

function openShiftModal() {
  if (getCurrentShift()) {
    return alert("⚠️ A shift is already open. Close it first.");
  }
  $("#shift-opening-cash").value = 0;
  $("#shift-open-notes").value = "";
  $("#open-shift-modal")?.classList.remove("hidden");
}

function confirmOpenShift() {
  if (getCurrentShift()) return;
  const opening = Math.max(0, Number($("#shift-opening-cash").value) || 0);
  const notes = $("#shift-open-notes").value.trim();
  shifts.push({
    id: "SHF-" + Date.now(),
    openedAt: new Date().toISOString(),
    openedBy: currentUser,
    openingCash: opening,
    notes,
  });
  saveAllData();
  $("#open-shift-modal")?.classList.add("hidden");
  renderCashDrawerView();
  showAppToast(`✅ Shift opened with ${fmtCurrency(opening)}`, "#16a34a");
}

function closeShiftModal() {
  const cur = getCurrentShift();
  if (!cur) return alert("ℹ️ No active shift to close.");
  const cashSales = getShiftCashSales(cur);
  const expected = (Number(cur.openingCash) || 0) + cashSales;
  $("#close-shift-summary").innerHTML = `
    <div><strong>Opening:</strong> ${fmtCurrency(cur.openingCash)}</div>
    <div><strong>Cash Sales:</strong> ${fmtCurrency(cashSales)}</div>
    <div style="font-size:15px;margin-top:6px;"><strong>Expected:</strong> <span style="color:#0ea5e9;">${fmtCurrency(expected)}</span></div>
  `;
  $("#shift-counted-cash").value = expected.toFixed(2);
  $("#shift-close-notes").value = "";
  $("#shift-variance-display").textContent = "";

  $("#shift-counted-cash").oninput = () => {
    const counted = Number($("#shift-counted-cash").value) || 0;
    const v = counted - expected;
    const color = v < 0 ? "#dc2626" : v > 0 ? "#16a34a" : "var(--muted)";
    $("#shift-variance-display").innerHTML = `Variance: <span style="color:${color};">${fmtCurrency(v)}</span>`;
  };
  $("#shift-counted-cash").dispatchEvent(new Event("input"));
  $("#close-shift-modal")?.classList.remove("hidden");
}

function confirmCloseShift() {
  const cur = getCurrentShift();
  if (!cur) return;
  cur.closedAt = new Date().toISOString();
  cur.closedBy = currentUser;
  cur.cashSales = getShiftCashSales(cur);
  cur.expectedCash = (Number(cur.openingCash) || 0) + cur.cashSales;
  cur.countedCash = Math.max(0, Number($("#shift-counted-cash").value) || 0);
  cur.variance = cur.countedCash - cur.expectedCash;
  cur.closeNotes = $("#shift-close-notes").value.trim();
  saveAllData();
  $("#close-shift-modal")?.classList.add("hidden");
  renderCashDrawerView();
  const v = cur.variance;
  const msg = v === 0 ? "✅ Shift closed — drawer matched perfectly!" :
              v > 0 ? `✅ Shift closed — Rs ${v.toFixed(2)} over` :
              `⚠️ Shift closed — Rs ${Math.abs(v).toFixed(2)} short`;
  showAppToast(msg, v < 0 ? "#dc2626" : "#16a34a");
}

// ==================== AI SMART INSIGHTS ====================
let _aiInsightLastSummary = "";

async function fetchAndShowAIInsights(lang = "en") {
  const out = $("#ai-insight-content");
  if (!out) return;
  out.textContent = "🧠 Thinking…";
  try {
    const r = await fetch("/api/insights/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    const d = await r.json();
    if (d.ok) {
      _aiInsightLastSummary = d.summary;
      out.textContent = d.summary + (d.ai ? "\n\n— AI Generated" : "\n\n— Fallback (AI unavailable)");
    } else {
      out.textContent = "❌ " + (d.error || "failed");
    }
  } catch (e) {
    out.textContent = "❌ " + e.message;
  }
}

function openAIInsightsModal() {
  $("#ai-insights-modal")?.classList.remove("hidden");
  fetchAndShowAIInsights("en");
}

async function sendAIInsightsToOwner() {
  if (!_aiInsightLastSummary) return alert("Generate insights first");
  const cfg = appSettingsCache || {};
  const phone = cfg.businessPhone || "";
  if (!phone) return alert("⚠️ Set your business phone in Settings → Business first.");
  showAppToast("📤 Sending to owner via WhatsApp…", "#0ea5e9");
  try {
    const r = await fetch("/api/whatsapp/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        message: `📊 *Zyphra POS — Daily AI Insights*\n${new Date().toLocaleDateString()}\n\n${_aiInsightLastSummary}`,
      }),
    });
    const d = await r.json();
    if (d.ok) showAppToast("✅ Sent to owner!", "#16a34a");
    else showAppToast("❌ " + (d.error || "failed"), "#dc2626");
  } catch (e) {
    showAppToast("❌ " + e.message, "#dc2626");
  }
}

// ==================== EVENT LISTENERS (NEW FEATURES) ====================
document.addEventListener("DOMContentLoaded", () => {
  // Load settings cache early
  loadAppSettings().then(() => updateBillingLoyaltyCard());

  const on = (id, ev, fn) => $("#" + id)?.addEventListener(ev, fn);

  // -- Quotations --
  on("btn-new-quotation", "click", openQuotationModal);
  on("q-modal-cancel", "click", closeQuotationModal);
  on("q-add-item", "click", addItemToQuote);
  on("q-item-search", "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addItemToQuote(); } });
  on("q-save-draft", "click", () => { if (saveQuotation("draft")) { closeQuotationModal(); renderQuotationsView(); } });
  on("q-save-pdf", "click", () => {
    const q = saveQuotation("draft");
    if (q) { closeQuotationModal(); renderQuotationsView(); downloadQuotationPDF(q.id); }
  });
  on("q-save-wa", "click", () => {
    const q = saveQuotation("sent");
    if (q) { closeQuotationModal(); renderQuotationsView(); sendQuotationWA(q.id); }
  });
  on("quote-search", "input", () => renderQuotationsView());
  on("quote-status-filter", "change", () => renderQuotationsView());

  // -- Warranties --
  on("warranty-search", "input", () => renderWarrantiesView());
  on("warranty-status-filter", "change", () => renderWarrantiesView());
  on("btn-warranty-lookup", "click", openWarrantyLookupModal);
  on("warranty-lookup-input", "input", doWarrantyLookup);
  on("warranty-lookup-close", "click", () => $("#warranty-lookup-modal")?.classList.add("hidden"));

  // -- Loyalty --
  on("loyalty-search", "input", () => renderLoyaltyView());
  on("loyalty-sort", "change", () => renderLoyaltyView());
  on("btn-loyalty-settings", "click", () => {
    const cfg = getLoyaltyConfig();
    $("#loy-enabled").checked = cfg.enabled;
    $("#loy-earn-rate").value = cfg.earnRate;
    $("#loy-redeem-rate").value = cfg.redeemRate;
    $("#loyalty-settings-modal")?.classList.remove("hidden");
  });
  on("loy-settings-cancel", "click", () => $("#loyalty-settings-modal")?.classList.add("hidden"));
  on("loy-settings-save", "click", async () => {
    const d = await saveLoyaltyConfig({
      enabled: $("#loy-enabled").checked,
      earnRate: Math.max(1, Number($("#loy-earn-rate").value) || 100),
      redeemRate: Math.max(1, Number($("#loy-redeem-rate").value) || 50),
    });
    if (d.ok) {
      $("#loyalty-settings-modal")?.classList.add("hidden");
      renderLoyaltyView();
      updateBillingLoyaltyCard();
      showAppToast("✅ Loyalty settings saved", "#16a34a");
    }
  });
  // Billing-side redeem
  on("bl-redeem-btn", "click", () => {
    const cust = customers.find((c) => c.id === selectedBillingCustomerId);
    if (!cust) return alert("Select a customer first");
    const cfg = getLoyaltyConfig();
    const ask = Math.floor(Number($("#bl-redeem-input").value) || 0);
    const max = Number(cust.loyaltyPoints) || 0;
    if (ask <= 0) return alert("Enter how many points to redeem");
    if (ask > max) return alert(`Customer only has ${max} points`);
    billingLoyaltyRedeemed = ask;
    const cashOff = (ask / 100) * cfg.redeemRate;
    const applied = $("#bl-redeem-applied");
    if (applied) {
      applied.classList.remove("hidden");
      applied.textContent = `✓ Redeeming ${ask} pts = ${fmtCurrency(cashOff)} off`;
    }
    showAppToast(`✓ ${ask} pts will be applied at checkout (${fmtCurrency(cashOff)} off)`, "#f59e0b");
  });

  // -- Cash Drawer --
  on("btn-open-shift", "click", openShiftModal);
  on("btn-close-shift", "click", closeShiftModal);
  on("shift-open-cancel", "click", () => $("#open-shift-modal")?.classList.add("hidden"));
  on("shift-open-confirm", "click", confirmOpenShift);
  on("shift-close-cancel", "click", () => $("#close-shift-modal")?.classList.add("hidden"));
  on("shift-close-confirm", "click", confirmCloseShift);

  // -- AI Insights --
  on("btn-ai-insights", "click", openAIInsightsModal);
  on("ai-insight-en", "click", () => fetchAndShowAIInsights("en"));
  on("ai-insight-si", "click", () => fetchAndShowAIInsights("si"));
  on("ai-insight-refresh", "click", () => fetchAndShowAIInsights("en"));
  on("ai-insight-close", "click", () => $("#ai-insights-modal")?.classList.add("hidden"));
  on("ai-insight-wa", "click", sendAIInsightsToOwner);

  // -- Barcode print from product modal --
  on("btn-print-barcode", "click", () => {
    if (!editingProductId) return alert("Save the product first to print its barcode.");
    const p = products.find((x) => x.id === editingProductId);
    openBarcodePrintWindow(p);
  });

  // -- Batch label print button --
  on("btn-print-labels", "click", () => openBarcodeLabelModal([]));
});

// ============================================================
// LOW-STOCK ALERT WIDGET (v2.1)
// ============================================================

let _lswDismissed = false;

function getLowStockProducts() {
  return products.filter((p) => {
    const threshold = p.lowStockAlert != null && !Number.isNaN(Number(p.lowStockAlert))
      ? Number(p.lowStockAlert)
      : LOW_STOCK_THRESH;
    return p.stock <= threshold;
  });
}

function renderLowStockWidget() {
  const widget = $("#low-stock-widget");
  const navBadge = $("#nav-low-stock-badge");
  const items = getLowStockProducts();
  const count = items.length;

  // Always update the sidebar nav badge
  if (navBadge) {
    if (count > 0) {
      navBadge.textContent = count;
      navBadge.classList.remove("hidden");
    } else {
      navBadge.classList.add("hidden");
    }
  }

  if (!widget) return;

  if (count === 0 || _lswDismissed) {
    widget.classList.add("hidden");
    return;
  }

  widget.classList.remove("hidden");
  const outOfStock = items.filter((p) => p.stock === 0).length;
  const sub = `${outOfStock > 0 ? outOfStock + " out of stock · " : ""}${count - outOfStock} critically low`;
  $("#lsw-count-badge").textContent = count;
  $("#lsw-subtitle").textContent = sub;

  const container = $("#lsw-items");
  if (!container) return;

  container.innerHTML = items.map((p) => {
    const threshold = p.lowStockAlert != null && !Number.isNaN(Number(p.lowStockAlert))
      ? Number(p.lowStockAlert) : LOW_STOCK_THRESH;
    const urgency = p.stock === 0 ? "lsw-out" : p.stock <= Math.ceil(threshold / 2) ? "lsw-critical" : "lsw-low";
    const suggest = Math.max(threshold * 3, 10); // suggested reorder qty
    return `
      <div class="lsw-item ${urgency}" data-id="${p.id}">
        <div class="lsw-item-info">
          <div class="lsw-item-name">${escapeHtml(p.name)}</div>
          <div class="lsw-item-meta">SKU: ${escapeHtml(p.sku)} · Category: ${escapeHtml(p.category)}</div>
        </div>
        <div class="lsw-item-stock">
          <span class="lsw-stock-num" style="${p.stock === 0 ? "color:#dc2626;" : "color:#f59e0b;"}">${p.stock}</span>
          <span class="lsw-stock-label">/ ${threshold} min</span>
        </div>
        <div class="lsw-item-btns">
          <button class="small lsw-po-single" data-id="${p.id}" data-suggest="${suggest}"
            style="background:#7c3aed;color:#fff;">
            <i class="fa fa-truck"></i> Create PO
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Per-item PO buttons
  qsa(".lsw-po-single").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const pid = e.currentTarget.dataset.id;
      const suggestQty = Number(e.currentTarget.dataset.suggest) || 10;
      openPurchaseOrderWithProduct(pid, suggestQty);
    }),
  );
}

function openPurchaseOrderWithProduct(productId, suggestQty) {
  const p = products.find((x) => x.id === productId);
  if (!p) return;
  switchView("purchasing");
  showPurchaseForm();
  setTimeout(() => {
    const itemSearch = $("#purchase-item-search");
    if (itemSearch) itemSearch.value = p.name;
    const itemQty = $("#purchase-item-qty");
    if (itemQty) itemQty.value = suggestQty;
    const itemCost = $("#purchase-item-cost");
    if (itemCost && p.costPrice) itemCost.value = p.costPrice;
    const itemRetail = $("#purchase-item-retail");
    if (itemRetail) itemRetail.value = p.price;
    const dateEl = $("#purchase-date");
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split("T")[0];
    itemSearch && itemSearch.focus();
    showAppToast(`✅ Pre-filled PO for "${p.name}" — select supplier and confirm`, "#7c3aed");
  }, 200);
}

function openBulkPurchaseOrder() {
  const items = getLowStockProducts();
  if (items.length === 0) return;
  switchView("purchasing");
  showPurchaseForm();
  setTimeout(() => {
    const dateEl = $("#purchase-date");
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split("T")[0];
    showAppToast(`📦 Bulk PO: Add ${items.length} low-stock items one by one`, "#7c3aed", 4000);
    // Auto-fill the first item
    if (items[0]) {
      const p = items[0];
      const threshold = p.lowStockAlert != null ? Number(p.lowStockAlert) : LOW_STOCK_THRESH;
      const suggest = Math.max(threshold * 3, 10);
      const itemSearch = $("#purchase-item-search");
      if (itemSearch) itemSearch.value = p.name;
      const itemQty = $("#purchase-item-qty");
      if (itemQty) itemQty.value = suggest;
      const itemCost = $("#purchase-item-cost");
      if (itemCost && p.costPrice) itemCost.value = p.costPrice;
      const itemRetail = $("#purchase-item-retail");
      if (itemRetail) itemRetail.value = p.price;
      itemSearch && itemSearch.focus();
    }
  }, 300);
}

// Wire low-stock widget events (runs at DOMContentLoaded)
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("lsw-dismiss")?.addEventListener("click", () => {
    _lswDismissed = true;
    const widget = $("#low-stock-widget");
    if (widget) widget.classList.add("hidden");
  });
  document.getElementById("lsw-bulk-po")?.addEventListener("click", openBulkPurchaseOrder);
});

// ── Anti-Spam Management UI ───────────────────────────────────

async function loadSpamBlockedList() {
  const el = $("#spam-blocked-list");
  const logEl = $("#spam-log-list");
  if (!el) return;
  if (logEl) logEl.style.display = "none";
  el.style.display = "block";
  el.innerHTML = `<div style="color:#9ca3af;font-size:13px;padding:8px 0;">Loading…</div>`;
  try {
    const r = await fetch("/api/spam/blocked", { headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") } });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "Failed");
    const blocked = d.blocked || {};
    const entries = Object.entries(blocked);
    if (!entries.length) {
      el.innerHTML = `<div style="color:#9ca3af;font-size:13px;padding:8px 0;text-align:center;">No blocked numbers.</div>`;
      return;
    }
    el.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Blocked Numbers (${entries.length})</div>
      ${entries.map(([jid, info]) => {
        const phone = jid.replace("@s.whatsapp.net", "").replace("@g.us", " (group)");
        const blockTime = info.blockedAt ? new Date(info.blockedAt).toLocaleString("en-GB") : "—";
        const untilStr = info.permanent ? "Permanent" : info.until ? new Date(info.until).toLocaleString("en-GB") : "—";
        return `<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-weight:700;font-size:13px;color:#e5e7eb;">${phone}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${info.reason || "No reason"}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">Blocked: ${blockTime} &bull; Until: <span style="color:${info.permanent ? "#ef4444" : "#f59e0b"}">${untilStr}</span></div>
          </div>
          <button onclick="spamUnblock('${jid}')" style="background:#dc2626;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap;">Unblock</button>
        </div>`;
      }).join("")}
      <div style="margin-top:10px;">
        <button onclick="spamManualBlock()" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;">
          <i class="fas fa-ban"></i> Block a Number
        </button>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div style="color:#ef4444;font-size:13px;">Error: ${e.message}</div>`;
  }
}

async function loadSpamLog() {
  const el = $("#spam-log-list");
  const blockedEl = $("#spam-blocked-list");
  if (!el) return;
  if (blockedEl) blockedEl.style.display = "none";
  el.style.display = "block";
  el.innerHTML = `<div style="color:#9ca3af;font-size:13px;padding:8px 0;">Loading…</div>`;
  try {
    const r = await fetch("/api/spam/log?limit=30", { headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") } });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "Failed");
    const logs = d.log || [];
    if (!logs.length) {
      el.innerHTML = `<div style="color:#9ca3af;font-size:13px;padding:8px 0;text-align:center;">No spam events logged yet.</div>`;
      return;
    }
    const actionColor = { auto_blocked: "#ef4444", rate_limit_minute: "#f59e0b", rate_limit_hour: "#f59e0b", duplicate_spam: "#a855f7", spam_content: "#f97316", blocked: "#ef4444", unblocked: "#22c55e" };
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Recent Spam Events (${logs.length})</div>
        <button onclick="clearSpamLogUI()" style="background:#374151;color:#9ca3af;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;">Clear Log</button>
      </div>
      <div style="max-height:260px;overflow-y:auto;">
        ${logs.map(l => {
          const phone = (l.jid || "").replace("@s.whatsapp.net", "");
          const ts = l.time ? new Date(l.time).toLocaleString("en-GB") : "";
          const color = actionColor[l.action] || "#9ca3af";
          return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:7px 10px;border-bottom:1px solid #1e293b;font-size:12px;">
            <div>
              <span style="color:${color};font-weight:700;font-size:11px;text-transform:uppercase;">${(l.action || "").replace(/_/g, " ")}</span>
              <span style="color:#9ca3af;margin:0 6px;">•</span><span style="color:#e5e7eb;">${phone}</span>
              ${l.reason ? `<div style="color:#6b7280;font-size:11px;">${l.reason}${l.text ? ` — "${l.text}"` : ""}</div>` : ""}
            </div>
            <span style="color:#4b5563;font-size:10px;white-space:nowrap;margin-left:8px;">${ts}</span>
          </div>`;
        }).join("")}
      </div>`;
  } catch (e) {
    el.innerHTML = `<div style="color:#ef4444;font-size:13px;">Error: ${e.message}</div>`;
  }
}

async function spamUnblock(jid) {
  if (!confirm(`Unblock ${jid.replace("@s.whatsapp.net", "")}?`)) return;
  try {
    const r = await fetch(`/api/spam/block/${encodeURIComponent(jid)}`, {
      method: "DELETE",
      headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") },
    });
    const d = await r.json();
    if (d.ok) { showAppToast("✅ Number unblocked", "#16a34a"); loadSpamBlockedList(); }
    else throw new Error(d.error);
  } catch (e) { showAppToast("❌ " + e.message, "#dc2626"); }
}

async function spamManualBlock() {
  const jidRaw = prompt("Enter phone number to block (e.g. 94771234567):");
  if (!jidRaw) return;
  const reason = prompt("Reason (optional):") || "Manual block by admin";
  const durStr = prompt("Block duration in minutes (leave blank for permanent):");
  const durationMin = durStr ? parseInt(durStr) : null;
  try {
    const r = await fetch("/api/spam/block", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pos-token": (localStorage.getItem("pos_token") || "") },
      body: JSON.stringify({ jid: jidRaw.trim(), reason, durationMin }),
    });
    const d = await r.json();
    if (d.ok) { showAppToast("✅ Number blocked", "#16a34a"); loadSpamBlockedList(); }
    else throw new Error(d.error);
  } catch (e) { showAppToast("❌ " + e.message, "#dc2626"); }
}

async function clearSpamLogUI() {
  if (!confirm("Clear all spam log entries?")) return;
  try {
    const r = await fetch("/api/spam/clear-log", {
      method: "POST",
      headers: { "x-pos-token": (localStorage.getItem("pos_token") || "") },
    });
    const d = await r.json();
    if (d.ok) { showAppToast("✅ Spam log cleared", "#16a34a"); loadSpamLog(); }
    else throw new Error(d.error);
  } catch (e) { showAppToast("❌ " + e.message, "#dc2626"); }
}

// ==================== WHATSAPP CONTACTS & ORDERS ====================
let _waContactsAll = [];
let _waOrdersAll   = [];

function openWAContactsModal() {
  const m = document.getElementById("wa-contacts-modal");
  if (!m) return;
  m.classList.remove("hidden");
  switchWATab("contacts");
  loadWAContacts();
}

function switchWATab(tab) {
  const cTab = document.getElementById("wa-contacts-tab");
  const oTab = document.getElementById("wa-orders-tab");
  const cBtn = document.getElementById("wa-tab-contacts");
  const oBtn = document.getElementById("wa-tab-orders");
  if (tab === "contacts") {
    if (cTab) cTab.style.display = "flex";
    if (oTab) oTab.style.display = "none";
    if (cBtn) { cBtn.style.background = "#7c3aed"; cBtn.style.color = "#fff"; }
    if (oBtn) { oBtn.style.background = "#374151"; oBtn.style.color = "#9ca3af"; }
    loadWAContacts();
  } else {
    if (cTab) cTab.style.display = "none";
    if (oTab) oTab.style.display = "flex";
    if (cBtn) { cBtn.style.background = "#374151"; cBtn.style.color = "#9ca3af"; }
    if (oBtn) { oBtn.style.background = "#7c3aed"; oBtn.style.color = "#fff"; }
    loadWAOrders();
  }
}

async function loadWAContacts() {
  const el = document.getElementById("wa-contacts-list");
  if (!el) return;
  el.innerHTML = `<div style="color:#6b7280;text-align:center;padding:24px;">Loading contacts…</div>`;
  try {
    const r = await fetch("/api/whatsapp/contacts", { headers: { "x-pos-token": localStorage.getItem("pos_token") || "" } });
    const d = await r.json();
    _waContactsAll = d.contacts || [];
    renderWAContacts();
  } catch (e) {
    el.innerHTML = `<div style="color:#f87171;padding:12px;">Error: ${e.message}</div>`;
  }
}

function filterWAContacts() {
  renderWAContacts();
}

function renderWAContacts() {
  const el  = document.getElementById("wa-contacts-list");
  const q   = (document.getElementById("wa-contacts-search")?.value || "").toLowerCase();
  if (!el) return;
  const filtered = _waContactsAll.filter((c) =>
    !q ||
    (c.phone || "").includes(q) ||
    (c.fullPhone || "").includes(q) ||
    (c.name || "").toLowerCase().includes(q) ||
    (c.linkedCustomer?.name || "").toLowerCase().includes(q)
  );
  if (!filtered.length) {
    el.innerHTML = `<div style="color:#6b7280;text-align:center;padding:32px;">
      ${_waContactsAll.length === 0 ? "No contacts yet. Customers need to message the bot first." : "No contacts match your search."}
    </div>`;
    return;
  }
  el.innerHTML = filtered.map((c) => {
    const linked = c.linkedCustomer;
    const lastSeen = c.lastSeen ? new Date(c.lastSeen).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "—";
    const firstSeen = c.firstSeen ? new Date(c.firstSeen).toLocaleDateString("en-GB") : "—";
    return `
    <div style="background:#1f2937;border:1px solid #374151;border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="width:40px;height:40px;border-radius:50%;background:${linked ? "#059669" : "#374151"};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">
        ${linked ? "👤" : "💬"}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;color:#f3f4f6;font-size:14px;">${escapeHtml(c.name || "Unknown")}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px;">
          📱 +${escapeHtml(c.fullPhone || c.phone || "—")}
          &nbsp;|&nbsp; 💬 ${c.msgCount || 0} msgs
          &nbsp;|&nbsp; 🕒 Last: ${lastSeen}
        </div>
        ${linked
          ? `<div style="font-size:12px;color:#34d399;margin-top:3px;">✅ Linked → <strong>${escapeHtml(linked.name)}</strong></div>`
          : `<div style="font-size:12px;color:#f59e0b;margin-top:3px;">⚠️ Not linked to a customer</div>`
        }
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0;">
        <div style="background:#111827;border-radius:5px;padding:3px 8px;font-size:11px;color:#6b7280;font-family:monospace;">${escapeHtml(c.jid)}</div>
        <div style="display:flex;gap:5px;">
          <button onclick="copyToClipboard('${escapeHtml(c.fullPhone || c.phone)}')"
            style="padding:4px 10px;font-size:11px;background:#374151;color:#d1d5db;border:none;border-radius:5px;cursor:pointer;">
            📋 Copy Number
          </button>
          <button onclick="copyToClipboard('${escapeHtml(c.jid)}')"
            style="padding:4px 10px;font-size:11px;background:#374151;color:#d1d5db;border:none;border-radius:5px;cursor:pointer;">
            📋 Copy JID
          </button>
          ${!linked ? `<button onclick="waContactQuickAdd('${escapeHtml(c.fullPhone || c.phone)}','${escapeHtml(c.name || "")}')"
            style="padding:4px 10px;font-size:11px;background:#1d4ed8;color:#fff;border:none;border-radius:5px;cursor:pointer;">
            ➕ Add Customer
          </button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showAppToast("✅ Copied!", "#059669")).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    showAppToast("✅ Copied!", "#059669");
  });
}

function waContactQuickAdd(phone, name) {
  // Pre-fill the customer add form and open it
  switchView("customers");
  document.getElementById("wa-contacts-modal")?.classList.add("hidden");
  setTimeout(() => {
    const addBtn = document.querySelector("#customers-view .add-btn, #btn-add-customer");
    if (addBtn) addBtn.click();
    setTimeout(() => {
      const phoneEl = document.getElementById("cust-phone");
      const nameEl  = document.getElementById("cust-name");
      if (phoneEl) phoneEl.value = phone;
      if (nameEl && name) nameEl.value = name;
    }, 200);
  }, 300);
}

async function loadWAOrders() {
  const el = document.getElementById("wa-orders-list");
  if (!el) return;
  el.innerHTML = `<div style="color:#6b7280;text-align:center;padding:24px;">Loading orders…</div>`;
  try {
    const r = await fetch("/api/whatsapp/orders", { headers: { "x-pos-token": localStorage.getItem("pos_token") || "" } });
    const d = await r.json();
    _waOrdersAll = d.orders || [];
    renderWAOrders();
  } catch (e) {
    el.innerHTML = `<div style="color:#f87171;padding:12px;">Error: ${e.message}</div>`;
  }
}

function renderWAOrders() {
  const el  = document.getElementById("wa-orders-list");
  const flt = document.getElementById("wa-orders-filter")?.value || "";
  if (!el) return;
  const filtered = flt ? _waOrdersAll.filter((o) => o.status === flt) : _waOrdersAll;
  if (!filtered.length) {
    el.innerHTML = `<div style="color:#6b7280;text-align:center;padding:32px;">
      ${_waOrdersAll.length === 0 ? "No WhatsApp orders yet. Customers can order by typing 'order' in the bot." : "No orders match the selected filter."}
    </div>`;
    return;
  }
  const statusColors = { pending:"#f59e0b", confirmed:"#3b82f6", completed:"#10b981", cancelled:"#ef4444" };
  el.innerHTML = filtered.map((o) => {
    const date = new Date(o.date).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
    const sc = statusColors[o.status] || "#6b7280";
    const itemLines = (o.items || []).map((it) => `• ${escapeHtml(it.name)} x${it.qty} — ${fmtCurrency(it.total || it.price * it.qty)}`).join("<br>");
    return `
    <div style="background:#1f2937;border:1px solid #374151;border-left:3px solid ${sc};border-radius:8px;padding:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-weight:700;font-size:15px;color:#f3f4f6;">🛒 ${escapeHtml(o.id)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">
            👤 ${escapeHtml(o.customerName)} &nbsp;|&nbsp; 📱 +${escapeHtml(o.customerPhone || "—")} &nbsp;|&nbsp; 📅 ${date}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:${sc}22;color:${sc};border:1px solid ${sc};border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600;text-transform:uppercase;">${o.status}</span>
          <select onchange="updateWAOrderStatus('${o.id}', this.value)"
            style="padding:4px 8px;border-radius:6px;border:1px solid #374151;background:#111827;color:#f3f4f6;font-size:12px;cursor:pointer;">
            <option value="">Update…</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div style="font-size:13px;color:#d1d5db;margin-bottom:8px;line-height:1.6;">${itemLines}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div style="font-size:15px;font-weight:700;color:#a78bfa;">💰 Total: ${fmtCurrency(o.total)}</div>
        <div style="display:flex;gap:6px;">
          <button onclick="waOrderSendMsg('${escapeHtml(o.customerPhone)}','${escapeHtml(o.id)}')"
            style="padding:5px 12px;font-size:12px;background:#128c7e;color:#fff;border:none;border-radius:6px;cursor:pointer;">
            <i class="fab fa-whatsapp"></i> Send Update
          </button>
          <button onclick="waOrderConvertToInvoice('${escapeHtml(o.id)}')"
            style="padding:5px 12px;font-size:12px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;">
            🧾 Create Invoice
          </button>
        </div>
      </div>
    </div>`;
  }).join("");
}

async function updateWAOrderStatus(id, status) {
  if (!status) return;
  try {
    const r = await fetch(`/api/whatsapp/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-pos-token": localStorage.getItem("pos_token") || "" },
      body: JSON.stringify({ status }),
    });
    const d = await r.json();
    if (d.ok) { showAppToast(`✅ Order ${id} → ${status}`, "#059669"); loadWAOrders(); }
    else throw new Error(d.error);
  } catch (e) { showAppToast("❌ " + e.message, "#dc2626"); }
}

async function waOrderSendMsg(phone, orderId) {
  const msg = `Hi! Your WhatsApp order *${orderId}* has been updated. Please contact us for payment & delivery details. Thank you! 🙏`;
  if (!phone) { showAppToast("❌ No phone number", "#dc2626"); return; }
  try {
    const r = await fetch("/api/whatsapp/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pos-token": localStorage.getItem("pos_token") || "" },
      body: JSON.stringify({ phone, message: msg }),
    });
    const d = await r.json();
    if (d.ok) showAppToast("✅ Message sent via WhatsApp", "#059669");
    else throw new Error(d.error || "Send failed");
  } catch (e) { showAppToast("❌ " + e.message, "#dc2626"); }
}

function waOrderConvertToInvoice(orderId) {
  const order = _waOrdersAll.find((o) => o.id === orderId);
  if (!order) return;
  switchView("billing");
  document.getElementById("wa-contacts-modal")?.classList.add("hidden");
  setTimeout(() => {
    cartItems = [];
    (order.items || []).forEach((it) => {
      const prod = products.find((p) => p.name === it.name);
      cartItems.push({
        id: prod?.id || ("wa_" + Date.now()),
        name: it.name,
        price: it.price,
        qty: it.qty,
        discount: 0,
        warrantyMonths: prod?.warrantyMonths || 0,
      });
    });
    if (order.customerPhone) {
      const cust = customers.find((c) => c.phone && c.phone.replace(/\D/g,"").includes(order.customerPhone.replace(/\D/g,"").slice(-7)));
      if (cust) selectBillingCustomer(cust.id);
    }
    renderCart();
    showAppToast(`✅ WA Order ${orderId} loaded into billing`, "#059669");
  }, 400);
}

// ── Employee Profile Card & Modal ──────────────────────────────────────────
let _profileData = null; // cached profile for the modal session
let _profilePicPending = undefined; // base64 or null (null = remove, undefined = no change)

const ROLE_LABELS = { admin: "Admin", manager: "Manager", cashier: "Cashier", custom: "Custom" };

function _getAvatarColor(str) {
  const palette = ["#7c3aed","#2563eb","#059669","#d97706","#dc2626","#0891b2","#7c3aed","#db2777"];
  let h = 0;
  for (let i = 0; i < (str||"").length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function _renderProfileAvatar(containerEl, user, size = 44) {
  if (!containerEl) return;
  if (user && user.profilePic) {
    containerEl.innerHTML = `<img src="${user.profilePic}" alt="${escapeHtml(user.username)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    containerEl.style.background = "none";
  } else {
    const name = user ? (user.fullName || user.username || "?") : "?";
    const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase();
    containerEl.innerHTML = escapeHtml(initials || "?");
    containerEl.style.background = _getAvatarColor(name);
    containerEl.style.fontSize = size > 50 ? "28px" : "16px";
  }
}

async function initProfileCard() {
  const card = $("#profile-card");
  if (!card) return;
  try {
    const r = await fetch("/api/profile", {
      headers: { "x-pos-token": localStorage.getItem("pos_token") || "" }
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Failed");
    _profileData = data.user;
    _updateProfileCard(_profileData);
  } catch (e) {
    const nameEl = $("#profile-card-name");
    const roleEl = $("#profile-card-role");
    if (nameEl) nameEl.textContent = currentUser || "—";
    if (roleEl) roleEl.textContent = "—";
  }
}

function _updateProfileCard(user) {
  const avatarEl = $("#profile-card-avatar");
  const nameEl   = $("#profile-card-name");
  const roleEl   = $("#profile-card-role");
  if (!avatarEl) return;
  _renderProfileAvatar(avatarEl, user);
  if (nameEl) nameEl.textContent = user.fullName || user.username || "—";
  if (roleEl) roleEl.textContent = ROLE_LABELS[user.role] || user.role || "—";
}

function openProfileModal() {
  _profilePicPending = undefined;
  const modal = $("#profile-modal");
  if (!modal) return;

  // Populate fields from cached data
  const u = _profileData || {};
  $("#prf-fullname").value  = u.fullName  || "";
  $("#prf-phone").value     = u.phone     || "";
  $("#prf-email").value     = u.email     || "";
  $("#prf-bio").value       = u.bio       || "";
  $("#prf-cur-pw").value    = "";
  $("#prf-new-pw").value    = "";
  $("#prf-confirm-pw").value = "";

  // Password section — collapse by default
  const pwDetails = $("#profile-pw-details");
  if (pwDetails) pwDetails.removeAttribute("open");

  // Message clear
  const msg = $("#profile-msg");
  if (msg) { msg.textContent = ""; msg.style.color = ""; }

  // Render modal avatar
  _renderModalAvatar(u);

  modal.classList.remove("hidden");
}

function _renderModalAvatar(userOrPic) {
  const initSpan = $("#profile-modal-avatar-initials");
  const img      = $("#profile-modal-avatar-img");
  const container = $("#profile-modal-avatar");
  if (!container) return;

  const src = typeof userOrPic === "string" ? userOrPic : userOrPic.profilePic;

  if (src) {
    if (img) { img.src = src; img.style.display = "block"; }
    if (initSpan) initSpan.style.display = "none";
    container.style.background = "none";
  } else {
    if (img) { img.src = ""; img.style.display = "none"; }
    const name = (typeof userOrPic === "object") ? (userOrPic.fullName || userOrPic.username || "?") : (currentUser || "?");
    const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase();
    if (initSpan) { initSpan.textContent = initials || "?"; initSpan.style.display = ""; }
    container.style.background = `linear-gradient(135deg, ${_getAvatarColor(name)}, #4f46e5)`;
  }
}

function closeProfileModal() {
  const modal = $("#profile-modal");
  if (modal) modal.classList.add("hidden");
}

function handleProfilePicChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    showAppToast("Image must be under 3 MB", "#ef4444");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    _profilePicPending = e.target.result; // base64 data URL
    _renderModalAvatar(_profilePicPending);
  };
  reader.readAsDataURL(file);
  // reset input so same file can be re-selected
  event.target.value = "";
}

function removeProfilePic() {
  _profilePicPending = null; // null = explicitly remove
  _renderModalAvatar({ profilePic: null, fullName: $("#prf-fullname").value || currentUser });
}

async function saveProfile() {
  const btn = $("#btn-save-profile");
  const msg = $("#profile-msg");

  const fullName = $("#prf-fullname").value.trim();
  const phone    = $("#prf-phone").value.trim();
  const email    = $("#prf-email").value.trim();
  const bio      = $("#prf-bio").value.trim();
  const curPw    = $("#prf-cur-pw").value;
  const newPw    = $("#prf-new-pw").value;
  const confPw   = $("#prf-confirm-pw").value;

  // Validate password change if requested
  if (newPw || curPw) {
    if (!curPw) {
      if (msg) { msg.textContent = "Enter your current password."; msg.style.color = "#f87171"; }
      return;
    }
    if (newPw.length < 6) {
      if (msg) { msg.textContent = "New password must be at least 6 characters."; msg.style.color = "#f87171"; }
      return;
    }
    if (newPw !== confPw) {
      if (msg) { msg.textContent = "New passwords do not match."; msg.style.color = "#f87171"; }
      return;
    }
  }

  const body = { fullName, phone, email, bio };
  if (_profilePicPending !== undefined) body.profilePic = _profilePicPending; // base64 or null
  if (newPw) { body.currentPassword = curPw; body.newPassword = newPw; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
  if (msg) { msg.textContent = ""; }

  try {
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-pos-token": localStorage.getItem("pos_token") || ""
      },
      body: JSON.stringify(body)
    });
    const res = await r.json();
    if (!res.ok) throw new Error(res.error || "Save failed");

    _profileData = res.user;
    _profilePicPending = undefined;
    _updateProfileCard(_profileData);
    if (msg) { msg.textContent = "✓ Profile saved successfully!"; msg.style.color = "#34d399"; }
    // Auto-close after a beat
    setTimeout(closeProfileModal, 1200);
  } catch (e) {
    if (msg) { msg.textContent = "✗ " + e.message; msg.style.color = "#f87171"; }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
  }
}
