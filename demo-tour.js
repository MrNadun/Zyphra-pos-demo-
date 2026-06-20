// ============================================================
//  SD POS Demo — Guided Billing Tour
//  Auto-walks through the billing flow with simulated input.
// ============================================================

(function initDemoTour() {
  // Wait for the app to fully load
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(buildTourButton, 800);
  });

  // ── Tour state ───────────────────────────────────────────
  let tourActive = false;
  let currentStep = 0;
  let overlay = null;
  let tooltip = null;
  let highlight = null;
  let skipBtn = null;

  const STEPS = [
    {
      title: "Welcome to Zyphra-POS! 👋",
      body: "This 60-second tour shows you how fast and easy billing works. Let's add a product and create an invoice!",
      target: null,
      action: null,
      position: "center",
      btnLabel: "Start Tour →",
    },
    {
      title: "Step 1: Search for a product",
      body: "Type a product name or scan a barcode. We'll search for 'Intel' now…",
      target: "#billing-product-search",
      action: async () => {
        const el = document.querySelector("#billing-product-search");
        if (!el) return;
        el.focus();
        await typeInto(el, "Intel");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      position: "bottom",
      btnLabel: "Next →",
    },
    {
      title: "Step 2: Add product to cart",
      body: "Click a product from the suggestions to add it to the cart instantly!",
      target: ".billing-suggestions .suggestion-item, .suggestion-item, .product-suggestion",
      action: async () => {
        // Try to click the first suggestion
        const suggestion = document.querySelector(
          ".billing-suggestions .suggestion-item, .suggestion-item, [class*='suggestion']"
        );
        if (suggestion) {
          suggestion.click();
        } else {
          // Fallback: add item programmatically via addToCart if available
          if (typeof addToCart === "function" && window.products && window.products.length) {
            const intel = window.products.find(p => p.name.toLowerCase().includes("intel") || p.category === "Processors");
            if (intel) addToCart(intel.id || intel.sku);
          }
        }
        await sleep(400);
      },
      position: "bottom",
      btnLabel: "Added! Next →",
    },
    {
      title: "Step 3: Adjust quantity",
      body: "You can change the quantity directly in the cart. Each row has + / − controls.",
      target: ".cart-item, .cart-items",
      action: null,
      position: "right",
      btnLabel: "Got it →",
    },
    {
      title: "Step 4: Select a customer",
      body: "Type a customer name or phone number to link the sale. We'll pick 'Kasun Perera'…",
      target: "#billing-customer-search, #customer-search-input, [placeholder*='customer'], [placeholder*='name, email']",
      action: async () => {
        const el = document.querySelector(
          "#billing-customer-search, #customer-search-input, [placeholder*='name, email'], [placeholder*='customer']"
        );
        if (!el) return;
        el.focus();
        await typeInto(el, "Kasun");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(500);
        const opt = document.querySelector(".customer-option, .customer-suggestion, [class*='customer-drop']");
        if (opt) opt.click();
      },
      position: "bottom",
      btnLabel: "Next →",
    },
    {
      title: "Step 5: Choose payment method",
      body: "Select Cash, Card, Credit, or other methods. Multiple methods are supported!",
      target: ".payment-methods, [class*='pay-method'], .payment-pills",
      action: async () => {
        // Highlight the cash button
        const cashBtn = document.querySelector(
          ".pay-btn, [data-method='cash'], .payment-pill"
        );
        if (cashBtn) cashBtn.click();
      },
      position: "top",
      btnLabel: "Next →",
    },
    {
      title: "Step 6: Complete the sale! 🎉",
      body: "Click 'Checkout' to print the invoice, record the sale, and update stock automatically!",
      target: "#btn-checkout, .btn-checkout, [id*='checkout']",
      action: null,
      position: "top",
      btnLabel: "Finish Tour ✓",
    },
  ];

  // ── Build the floating tour launcher button ──────────────
  function buildTourButton() {
    const btn = document.createElement("button");
    btn.id = "demo-tour-btn";
    btn.innerHTML = '<i class="fas fa-play-circle" style="margin-right:6px;"></i> Try Billing Demo';
    btn.style.cssText = `
      position: fixed;
      bottom: 90px;
      right: 20px;
      z-index: 99990;
      background: linear-gradient(135deg, #7c3aed, #4f46e5);
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 11px 20px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(124,58,237,.5);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: transform .15s, box-shadow .15s;
      letter-spacing: .3px;
    `;
    btn.onmouseover = () => { btn.style.transform = "scale(1.05)"; btn.style.boxShadow = "0 6px 28px rgba(124,58,237,.7)"; };
    btn.onmouseout  = () => { btn.style.transform = "scale(1)";    btn.style.boxShadow = "0 4px 20px rgba(124,58,237,.5)"; };
    btn.onclick = startTour;
    document.body.appendChild(btn);
  }

  // ── Start the tour ───────────────────────────────────────
  function startTour() {
    if (tourActive) return;
    tourActive = true;
    currentStep = 0;

    // Navigate to billing view first
    const billingBtn = document.querySelector('.nav-btn[data-view="billing"]');
    if (billingBtn) billingBtn.click();

    // Clear any existing cart
    const clearBtn = document.getElementById("btn-clear-cart");
    if (clearBtn) clearBtn.click();
    setTimeout(() => {
      createOverlayElements();
      showStep(0);
    }, 400);
  }

  // ── Create DOM elements ──────────────────────────────────
  function createOverlayElements() {
    // Dark overlay
    overlay = document.createElement("div");
    overlay.id = "tour-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99991;pointer-events:none;transition:opacity .3s;";
    document.body.appendChild(overlay);

    // Highlight ring
    highlight = document.createElement("div");
    highlight.id = "tour-highlight";
    highlight.style.cssText = `
      position: fixed;
      z-index: 99992;
      border: 3px solid #a78bfa;
      border-radius: 10px;
      box-shadow: 0 0 0 4px rgba(167,139,250,.25), 0 0 30px rgba(167,139,250,.4);
      pointer-events: none;
      transition: all .35s cubic-bezier(.4,0,.2,1);
      background: rgba(167,139,250,.06);
    `;
    document.body.appendChild(highlight);

    // Tooltip card
    tooltip = document.createElement("div");
    tooltip.id = "tour-tooltip";
    tooltip.style.cssText = `
      position: fixed;
      z-index: 99993;
      background: #1e1e2e;
      border: 1px solid #3b3b5c;
      border-radius: 14px;
      padding: 20px 22px;
      width: 300px;
      box-shadow: 0 8px 40px rgba(0,0,0,.5);
      font-family: inherit;
      color: #e2e8f0;
      transition: all .3s cubic-bezier(.4,0,.2,1);
    `;
    document.body.appendChild(tooltip);

    // Skip button
    skipBtn = document.createElement("button");
    skipBtn.textContent = "Skip Tour";
    skipBtn.style.cssText = `
      position: fixed;
      top: 50px;
      right: 20px;
      z-index: 99994;
      background: rgba(255,255,255,.1);
      border: 1px solid rgba(255,255,255,.2);
      color: #fff;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      cursor: pointer;
    `;
    skipBtn.onclick = endTour;
    document.body.appendChild(skipBtn);
  }

  // ── Show a specific step ─────────────────────────────────
  async function showStep(index) {
    currentStep = index;
    const step = STEPS[index];
    const isLast = index === STEPS.length - 1;

    // Run the action
    if (step.action) {
      await step.action();
      await sleep(300);
    }

    // Find target element
    const target = step.target ? document.querySelector(step.target) : null;

    // Position highlight
    if (target) {
      positionHighlight(target);
    } else {
      highlight.style.opacity = "0";
    }

    // Build tooltip HTML
    const progress = `${index + 1} / ${STEPS.length}`;
    tooltip.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:.8px;">
          ${index === 0 ? "Demo Tour" : `Step ${index} of ${STEPS.length - 1}`}
        </span>
        <span style="font-size:11px;color:#64748b;">${progress}</span>
      </div>
      <div style="font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:8px;">${step.title}</div>
      <div style="font-size:13px;color:#94a3b8;line-height:1.55;margin-bottom:16px;">${step.body}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;gap:5px;">
          ${STEPS.map((_, i) => `<div style="width:${i === index ? 18 : 6}px;height:6px;border-radius:3px;background:${i === index ? '#7c3aed' : '#334155'};transition:width .3s;"></div>`).join("")}
        </div>
        <button id="tour-next-btn" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;">
          ${step.btnLabel}
        </button>
      </div>
    `;

    // Position tooltip
    positionTooltip(target, step.position);

    // Wire next button
    const nextBtn = document.getElementById("tour-next-btn");
    nextBtn.onclick = () => {
      if (isLast) {
        endTour(true);
      } else {
        showStep(index + 1);
      }
    };

    // Pulse the highlight element
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ── Position the highlight ring around an element ────────
  function positionHighlight(el) {
    const r = el.getBoundingClientRect();
    const pad = 6;
    highlight.style.cssText = `
      position: fixed;
      z-index: 99992;
      border: 3px solid #a78bfa;
      border-radius: 10px;
      box-shadow: 0 0 0 4px rgba(167,139,250,.25), 0 0 30px rgba(167,139,250,.4);
      pointer-events: none;
      transition: all .35s cubic-bezier(.4,0,.2,1);
      background: rgba(167,139,250,.06);
      top: ${r.top - pad}px;
      left: ${r.left - pad}px;
      width: ${r.width + pad * 2}px;
      height: ${r.height + pad * 2}px;
      opacity: 1;
    `;
  }

  // ── Position the tooltip near target ────────────────────
  function positionTooltip(target, position) {
    const TW = 300, TH = 180;
    const VP_W = window.innerWidth, VP_H = window.innerHeight;
    let top, left;

    if (!target || position === "center") {
      top  = (VP_H - TH) / 2;
      left = (VP_W - TW) / 2;
    } else {
      const r = target.getBoundingClientRect();
      const gap = 16;
      if (position === "bottom") {
        top  = Math.min(r.bottom + gap, VP_H - TH - 12);
        left = Math.min(Math.max(r.left + r.width / 2 - TW / 2, 10), VP_W - TW - 10);
      } else if (position === "top") {
        top  = Math.max(r.top - TH - gap, 50);
        left = Math.min(Math.max(r.left + r.width / 2 - TW / 2, 10), VP_W - TW - 10);
      } else if (position === "right") {
        top  = Math.min(Math.max(r.top + r.height / 2 - TH / 2, 50), VP_H - TH - 12);
        left = Math.min(r.right + gap, VP_W - TW - 10);
      } else {
        top  = Math.min(Math.max(r.top + r.height / 2 - TH / 2, 50), VP_H - TH - 12);
        left = Math.max(r.left - TW - gap, 10);
      }
    }

    tooltip.style.top  = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.opacity = "1";
  }

  // ── End the tour ─────────────────────────────────────────
  function endTour(success = false) {
    tourActive = false;
    [overlay, highlight, tooltip, skipBtn].forEach(el => el && el.remove());
    overlay = highlight = tooltip = skipBtn = null;

    if (success) {
      // Show a celebratory toast
      showCelebration();
    }
  }

  function showCelebration() {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      bottom: 90px;
      right: 28px;
      z-index: 99999;
      background: linear-gradient(135deg,#059669,#10b981);
      color: #fff;
      padding: 14px 22px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      box-shadow: 0 8px 30px rgba(16,185,129,.4);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideUp .4s ease;
    `;
    toast.innerHTML = `
      <span style="font-size:22px;">🎉</span>
      <div>
        <div>Tour Complete!</div>
        <div style="font-size:12px;font-weight:400;opacity:.85;">Try it yourself — it's fully interactive!</div>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ── Utilities ────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function typeInto(el, text) {
    el.value = "";
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(60);
    }
  }

  // ── Add animation keyframes ──────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideUp {
      from { opacity:0; transform: translateY(20px); }
      to   { opacity:1; transform: translateY(0); }
    }
    #tour-next-btn:hover {
      filter: brightness(1.15);
    }
    #demo-tour-btn {
      animation: tourPulse 2.5s infinite;
    }
    @keyframes tourPulse {
      0%,100% { box-shadow: 0 4px 20px rgba(124,58,237,.5); }
      50%      { box-shadow: 0 4px 30px rgba(124,58,237,.9); }
    }
  `;
  document.head.appendChild(style);
})();
