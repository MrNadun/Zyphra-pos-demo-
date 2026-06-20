// ============================================================
//  SD POS — Demo Interceptor
//  Mocks all backend API calls so the demo runs as a
//  fully-static site (Netlify / Vercel / GitHub Pages).
// ============================================================

// ── 1. Auto-login (set before app.js parses) ────────────────
(function seedAuth() {
  if (!localStorage.getItem("pos_logged_in")) {
    localStorage.setItem("pos_logged_in", "demo");
    localStorage.setItem("pos_token", "demo-token-2024");
    localStorage.setItem("pos_user", JSON.stringify({
      username: "demo",
      fullName: "Demo Admin",
      role: "admin",
      permissions: ["billing","products","customers","invoices","expenses","purchasing","analytics","settings","quotations","warranties","loyalty","cashdrawer","credit","advance"],
      email: "demo@sdcomputers.lk"
    }));
  }
})();

// ── 2. Sample Data ───────────────────────────────────────────
const DEMO_CATEGORIES = [
  "Processors", "RAM", "Storage", "Monitors", "Laptops",
  "Accessories", "Networking", "Graphics Cards", "Power Supply", "Services"
];

const DEMO_PRODUCTS = [
  { id:"p001", sku:"CPU001", name:"Intel Core i5-12400F Processor", category:"Processors", price:28500, costPrice:24000, stock:12, barcode:"CPU12400F", warrantyMonths:36, lowStockAlert:3 },
  { id:"p002", sku:"CPU002", name:"Intel Core i3-10100 Processor", category:"Processors", price:15500, costPrice:12500, stock:8, barcode:"CPUI3101", warrantyMonths:36, lowStockAlert:3 },
  { id:"p003", sku:"CPU003", name:"AMD Ryzen 5 5600X Processor", category:"Processors", price:32000, costPrice:27000, stock:5, barcode:"AMDR55600", warrantyMonths:36, lowStockAlert:3 },
  { id:"p004", sku:"CPU004", name:"Intel Core i7-12700K Processor", category:"Processors", price:58000, costPrice:50000, stock:3, barcode:"CPUI712700K", warrantyMonths:36, lowStockAlert:2 },
  { id:"p005", sku:"RAM001", name:"Kingston 8GB DDR4 3200MHz RAM", category:"RAM", price:6500, costPrice:5200, stock:25, barcode:"KNG8DDR4", warrantyMonths:60, lowStockAlert:5 },
  { id:"p006", sku:"RAM002", name:"Corsair 16GB DDR4 3200MHz RAM", category:"RAM", price:12500, costPrice:10500, stock:15, barcode:"COR16DDR4", warrantyMonths:60, lowStockAlert:5 },
  { id:"p007", sku:"RAM003", name:"Kingston 4GB DDR3 1600MHz RAM", category:"RAM", price:3200, costPrice:2400, stock:20, barcode:"KNG4DDR3", warrantyMonths:36, lowStockAlert:5 },
  { id:"p008", sku:"SSD001", name:"Samsung 500GB SSD SATA", category:"Storage", price:11500, costPrice:9500, stock:18, barcode:"SAM500SSD", warrantyMonths:60, lowStockAlert:4 },
  { id:"p009", sku:"SSD002", name:"WD Green 240GB SSD", category:"Storage", price:8500, costPrice:7000, stock:22, barcode:"WD240SSD", warrantyMonths:36, lowStockAlert:5 },
  { id:"p010", sku:"HDD001", name:"Seagate 1TB HDD 7200RPM", category:"Storage", price:9800, costPrice:8200, stock:10, barcode:"SEA1TBHDD", warrantyMonths:24, lowStockAlert:3 },
  { id:"p011", sku:"MON001", name:"Samsung 21.5\" FHD LED Monitor", category:"Monitors", price:22500, costPrice:19000, stock:7, barcode:"SAM215MON", warrantyMonths:12, lowStockAlert:2 },
  { id:"p012", sku:"MON002", name:"LG 24\" IPS 75Hz Monitor", category:"Monitors", price:35000, costPrice:29500, stock:4, barcode:"LG24IPS", warrantyMonths:12, lowStockAlert:2 },
  { id:"p013", sku:"LAP001", name:"HP 15s Intel i5 8GB 512GB Laptop", category:"Laptops", price:128000, costPrice:112000, stock:5, barcode:"HP15SI5", warrantyMonths:12, lowStockAlert:1 },
  { id:"p014", sku:"LAP002", name:"Lenovo IdeaPad Slim 3 Ryzen 5", category:"Laptops", price:112000, costPrice:98000, stock:3, barcode:"LEN3R5", warrantyMonths:12, lowStockAlert:1 },
  { id:"p015", sku:"ACC001", name:"Logitech M100 USB Mouse", category:"Accessories", price:1200, costPrice:800, stock:45, barcode:"LOGM100", warrantyMonths:12, lowStockAlert:10 },
  { id:"p016", sku:"ACC002", name:"A4Tech Wired Keyboard", category:"Accessories", price:1800, costPrice:1200, stock:30, barcode:"A4TKBD", warrantyMonths:12, lowStockAlert:8 },
  { id:"p017", sku:"ACC003", name:"Havit USB Hub 4-Port", category:"Accessories", price:1500, costPrice:950, stock:18, barcode:"HAVHUB4", warrantyMonths:6, lowStockAlert:5 },
  { id:"p018", sku:"GPU001", name:"NVIDIA GTX 1650 4GB GDDR6", category:"Graphics Cards", price:48000, costPrice:42000, stock:4, barcode:"GTX16504G", warrantyMonths:12, lowStockAlert:2 },
  { id:"p019", sku:"PSU001", name:"Corsair 550W 80+ Bronze PSU", category:"Power Supply", price:9500, costPrice:7800, stock:8, barcode:"COR550PSU", warrantyMonths:36, lowStockAlert:3 },
  { id:"p020", sku:"NET001", name:"TP-Link TL-WN823N WiFi Adapter", category:"Networking", price:2500, costPrice:1800, stock:25, barcode:"TPL823WIFI", warrantyMonths:12, lowStockAlert:5 },
  { id:"p021", sku:"SVC001", name:"OS Installation Service", category:"Services", price:1500, costPrice:0, stock:999, lowStockAlert:0 },
  { id:"p022", sku:"SVC002", name:"PC Repair & Cleaning Service", category:"Services", price:2500, costPrice:0, stock:999, lowStockAlert:0 },
  { id:"p023", sku:"SVC003", name:"Data Recovery Service", category:"Services", price:5000, costPrice:0, stock:999, lowStockAlert:0 },
  { id:"p024", sku:"ACC004", name:"HDMI Cable 1.5m", category:"Accessories", price:850, costPrice:450, stock:60, barcode:"HDMI15M", warrantyMonths:6, lowStockAlert:10 },
  { id:"p025", sku:"ACC005", name:"Thermal Paste (Tube)", category:"Accessories", price:450, costPrice:200, stock:35, barcode:"THERMPST", warrantyMonths:0, lowStockAlert:10 }
];

const DEMO_CUSTOMERS = [
  { id:"c001", name:"Kasun Perera", email:"kasun@gmail.com", phone:"+94 77 234 5678", address:"45, Galle Rd, Colombo 03", loyaltyPoints:1250, tags:["VIP"], createdAt:"2025-08-15T08:00:00Z", birthday:"1990-03-12" },
  { id:"c002", name:"Nadun Rajapaksa", email:"nadun@gmail.com", phone:"+94 71 456 7890", address:"12, Kandy Rd, Kegalle", loyaltyPoints:680, tags:[], createdAt:"2025-09-20T10:00:00Z", birthday:"1995-07-22" },
  { id:"c003", name:"Dilani Jayawardena", email:"dilani@yahoo.com", phone:"+94 76 789 0123", address:"88, Main St, Kurunegala", loyaltyPoints:320, tags:[], createdAt:"2025-10-05T09:00:00Z" },
  { id:"c004", name:"Chamara Silva", email:"chamara@hotmail.com", phone:"+94 70 321 6540", address:"15, Temple Rd, Polgahawela", loyaltyPoints:870, tags:["Regular"], createdAt:"2025-07-30T07:00:00Z", birthday:"1988-11-05" },
  { id:"c005", name:"Sujeewa Bandara", email:"sujeewa@gmail.com", phone:"+94 72 654 3210", address:"7, Station Rd, Alawwa", loyaltyPoints:125, tags:[], createdAt:"2026-01-10T11:00:00Z" },
  { id:"c006", name:"Nimal Fernando", email:"nimal@gmail.com", phone:"+94 78 111 2233", address:"23, Lake View, Negombo", loyaltyPoints:2100, tags:["VIP","Wholesale"], createdAt:"2025-05-01T08:00:00Z", birthday:"1985-04-18" },
  { id:"c007", name:"Priya Wickramasinghe", email:"priya@gmail.com", phone:"+94 75 445 6677", address:"55, Peradeniya Rd, Kandy", loyaltyPoints:560, tags:[], createdAt:"2025-11-12T14:00:00Z" },
  { id:"c008", name:"Roshan Kumara", email:"roshan.k@gmail.com", phone:"+94 77 998 8776", address:"3, New Town, Matara", loyaltyPoints:0, tags:[], createdAt:"2026-04-01T10:00:00Z" },
  { id:"c009", name:"Samantha Gunaratne", email:"saman@gmail.com", phone:"+94 71 667 7889", address:"9, Hospital Rd, Gampaha", loyaltyPoints:445, tags:["Regular"], createdAt:"2025-12-20T09:00:00Z" },
  { id:"c010", name:"Lasith Malinga", email:"lasith.m@gmail.com", phone:"+94 70 555 4433", address:"12, Beach Rd, Matara", loyaltyPoints:1890, tags:["VIP"], createdAt:"2025-06-15T08:00:00Z", birthday:"1983-08-28" }
];

// Build a date ISO string: daysBack days ago, at a specific hour (24h)
function makeDate(daysBack, hour) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
  return d.toISOString();
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function monthsAgo(m, day, hour) {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  if (day) d.setDate(day);
  if (hour !== undefined) d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// Helper: make an invoice object cleanly
function inv(id, type, cust, items, total, paid, method, dateStr, opts = {}) {
  const balance = total - paid;
  const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return {
    id, type,
    customer: cust,
    items,
    subtotal: opts.subtotal || total,
    discount: opts.discount || 0,
    tax: 0,
    total, paid, balance,
    paymentMethod: method,
    status,
    date: dateStr,        // ← analytics uses this field
    createdAt: dateStr,
    loyaltyEarnedPts: method === "cash" ? Math.floor(total / 100) : 0,
    ...(opts.payments ? { payments: opts.payments } : {})
  };
}

const C = {
  kasun:    { id:"c001", name:"Kasun Perera",         phone:"+94 77 234 5678" },
  nadun:    { id:"c002", name:"Nadun Rajapaksa",       phone:"+94 71 456 7890" },
  dilani:   { id:"c003", name:"Dilani Jayawardena",    phone:"+94 76 789 0123" },
  chamara:  { id:"c004", name:"Chamara Silva",         phone:"+94 70 321 6540" },
  sujeewa:  { id:"c005", name:"Sujeewa Bandara",       phone:"+94 72 654 3210" },
  nimal:    { id:"c006", name:"Nimal Fernando",        phone:"+94 78 111 2233" },
  priya:    { id:"c007", name:"Priya Wickramasinghe",  phone:"+94 75 445 6677" },
  roshan:   { id:"c008", name:"Roshan Kumara",         phone:"+94 77 998 8776" },
  samantha: { id:"c009", name:"Samantha Gunaratne",    phone:"+94 71 667 7889" },
  lasith:   { id:"c010", name:"Lasith Malinga",        phone:"+94 70 555 4433" },
};

const DEMO_INVOICES = [
  // ── TODAY (multiple hours for hourly chart) ───────────────────────
  inv("INV-0065","invoice", C.kasun,
    [{id:"p001",name:"Intel Core i5-12400F Processor",price:28500,qty:1,discount:0,warrantyMonths:36,serialNumber:"SN-CPU-065-01"},
     {id:"p005",name:"Kingston 8GB DDR4 3200MHz RAM",price:6500,qty:2,discount:0},
     {id:"p008",name:"Samsung 500GB SSD SATA",price:11500,qty:1,discount:0}],
    53000, 53000, "cash", makeDate(0, 9)),

  inv("INV-0064","receipt", null,
    [{id:"p015",name:"Logitech M100 USB Mouse",price:1200,qty:2,discount:0},
     {id:"p024",name:"HDMI Cable 1.5m",price:850,qty:1,discount:0}],
    3250, 3250, "cash", makeDate(0, 10)),

  inv("INV-0063","invoice", C.nimal,
    [{id:"p006",name:"Corsair 16GB DDR4 3200MHz RAM",price:12500,qty:2,discount:1000},
     {id:"p019",name:"Corsair 550W 80+ Bronze PSU",price:9500,qty:1,discount:0}],
    33500, 33500, "card", makeDate(0, 11)),

  inv("INV-0062","invoice", C.chamara,
    [{id:"p011",name:"Samsung 21.5\" FHD LED Monitor",price:22500,qty:1,discount:0},
     {id:"p016",name:"A4Tech Wired Keyboard",price:1800,qty:1,discount:0}],
    24300, 24300, "cash", makeDate(0, 13)),

  inv("INV-0061","receipt", null,
    [{id:"p020",name:"TP-Link WiFi Adapter",price:2500,qty:1,discount:0},
     {id:"p025",name:"Thermal Paste (Tube)",price:450,qty:2,discount:0}],
    3400, 3400, "cash", makeDate(0, 14)),

  inv("INV-0060","invoice", C.samantha,
    [{id:"p021",name:"OS Installation Service",price:1500,qty:1,discount:0},
     {id:"p022",name:"PC Repair & Cleaning Service",price:2500,qty:1,discount:0}],
    4000, 4000, "cash", makeDate(0, 15)),

  inv("INV-0059","invoice", C.roshan,
    [{id:"p003",name:"AMD Ryzen 5 5600X Processor",price:32000,qty:1,discount:0},
     {id:"p019",name:"Corsair 550W 80+ Bronze PSU",price:9500,qty:1,discount:0}],
    41500, 41500, "card", makeDate(0, 16)),

  inv("INV-0058","receipt", null,
    [{id:"p017",name:"Havit USB Hub 4-Port",price:1500,qty:1,discount:0},
     {id:"p024",name:"HDMI Cable 1.5m",price:850,qty:3,discount:0}],
    4050, 4050, "cash", makeDate(0, 17)),

  // ── YESTERDAY ─────────────────────────────────────────────────────
  inv("INV-0057","invoice", C.nimal,
    [{id:"p014",name:"Lenovo IdeaPad Slim 3 Ryzen 5",price:112000,qty:1,discount:5000}],
    107000, 50000, "credit", makeDate(1, 10),
    { payments:[{amount:50000,method:"cash",date:makeDate(1,10),note:"Initial deposit"}] }),

  inv("INV-0056","invoice", C.chamara,
    [{id:"p012",name:"LG 24\" IPS 75Hz Monitor",price:35000,qty:1,discount:2000}],
    33000, 33000, "card", makeDate(1, 12)),

  inv("INV-0055","receipt", null,
    [{id:"p015",name:"Logitech M100 USB Mouse",price:1200,qty:3,discount:0},
     {id:"p016",name:"A4Tech Wired Keyboard",price:1800,qty:1,discount:0}],
    5400, 5400, "cash", makeDate(1, 15)),

  // ── 2 DAYS AGO ────────────────────────────────────────────────────
  inv("INV-0054","invoice", C.lasith,
    [{id:"p018",name:"NVIDIA GTX 1650 4GB GDDR6",price:48000,qty:1,discount:3000}],
    45000, 45000, "card", makeDate(2, 11)),

  inv("INV-0053","receipt", null,
    [{id:"p024",name:"HDMI Cable 1.5m",price:850,qty:4,discount:0},
     {id:"p025",name:"Thermal Paste (Tube)",price:450,qty:2,discount:0}],
    4300, 4300, "cash", makeDate(2, 14)),

  // ── 3 DAYS AGO ────────────────────────────────────────────────────
  inv("INV-0052","invoice", C.nadun,
    [{id:"p001",name:"Intel Core i5-12400F Processor",price:28500,qty:1,discount:0,warrantyMonths:36,serialNumber:"SN-CPU-052-01"},
     {id:"p005",name:"Kingston 8GB DDR4 3200MHz RAM",price:6500,qty:2,discount:0}],
    41500, 41500, "cash", makeDate(3, 10)),

  inv("INV-0051","invoice", C.dilani,
    [{id:"p021",name:"OS Installation Service",price:1500,qty:1,discount:0},
     {id:"p009",name:"WD Green 240GB SSD",price:8500,qty:1,discount:0}],
    10000, 10000, "cash", makeDate(3, 16)),

  // ── 4 DAYS AGO ────────────────────────────────────────────────────
  inv("INV-0050","invoice", C.priya,
    [{id:"p013",name:"HP 15s Intel i5 8GB 512GB Laptop",price:128000,qty:1,discount:5000}],
    123000, 0, "credit", makeDate(4, 9), { payments:[] }),

  inv("INV-0049","receipt", null,
    [{id:"p020",name:"TP-Link WiFi Adapter",price:2500,qty:2,discount:0}],
    5000, 5000, "cash", makeDate(4, 14)),

  // ── 5 DAYS AGO ────────────────────────────────────────────────────
  inv("INV-0048","invoice", C.kasun,
    [{id:"p004",name:"Intel Core i7-12700K Processor",price:58000,qty:1,discount:3000,warrantyMonths:36,serialNumber:"SN-CPU-048-01"}],
    55000, 55000, "card", makeDate(5, 11)),

  inv("INV-0047","receipt", null,
    [{id:"p015",name:"Logitech M100 USB Mouse",price:1200,qty:2,discount:0},
     {id:"p017",name:"Havit USB Hub 4-Port",price:1500,qty:1,discount:0}],
    3900, 3900, "cash", makeDate(5, 15)),

  // ── 6 DAYS AGO ────────────────────────────────────────────────────
  inv("INV-0046","invoice", C.sujeewa,
    [{id:"p006",name:"Corsair 16GB DDR4 3200MHz RAM",price:12500,qty:1,discount:0},
     {id:"p008",name:"Samsung 500GB SSD SATA",price:11500,qty:1,discount:0}],
    24000, 24000, "cash", makeDate(6, 10)),

  // ── 8-14 DAYS AGO (older this month) ─────────────────────────────
  inv("INV-0045","invoice", C.nimal,
    [{id:"p005",name:"Kingston 8GB DDR4 3200MHz RAM",price:6500,qty:4,discount:1000}],
    25000, 25000, "cash", makeDate(8, 11)),

  inv("INV-0044","invoice", C.samantha,
    [{id:"p023",name:"Data Recovery Service",price:5000,qty:1,discount:0}],
    5000, 5000, "cash", makeDate(9, 14)),

  inv("INV-0043","invoice", C.lasith,
    [{id:"p012",name:"LG 24\" IPS 75Hz Monitor",price:35000,qty:1,discount:0}],
    35000, 35000, "card", makeDate(10, 9)),

  inv("INV-0042","receipt", null,
    [{id:"p016",name:"A4Tech Wired Keyboard",price:1800,qty:2,discount:0},
     {id:"p024",name:"HDMI Cable 1.5m",price:850,qty:3,discount:0}],
    6150, 6150, "cash", makeDate(11, 16)),

  inv("INV-0041","invoice", C.chamara,
    [{id:"p003",name:"AMD Ryzen 5 5600X Processor",price:32000,qty:1,discount:2000}],
    30000, 30000, "cash", makeDate(13, 10)),

  inv("INV-0040","invoice", C.kasun,
    [{id:"p011",name:"Samsung 21.5\" FHD LED Monitor",price:22500,qty:1,discount:0},
     {id:"p022",name:"PC Repair & Cleaning Service",price:2500,qty:1,discount:0}],
    25000, 25000, "cash", makeDate(14, 14)),

  // ── 15-30 DAYS AGO (rest of this month) ─────────────────────────
  inv("INV-0039","invoice", C.roshan,
    [{id:"p014",name:"Lenovo IdeaPad Slim 3 Ryzen 5",price:112000,qty:1,discount:8000}],
    104000, 104000, "card", makeDate(16, 11)),

  inv("INV-0038","invoice", C.dilani,
    [{id:"p007",name:"Kingston 4GB DDR3 1600MHz RAM",price:3200,qty:2,discount:0}],
    6400, 6400, "cash", makeDate(18, 13)),

  inv("INV-0037","invoice", C.sujeewa,
    [{id:"p020",name:"TP-Link WiFi Adapter",price:2500,qty:1,discount:0},
     {id:"p021",name:"OS Installation Service",price:1500,qty:1,discount:0}],
    4000, 4000, "cash", makeDate(20, 10)),

  inv("INV-0036","invoice", C.nadun,
    [{id:"p018",name:"NVIDIA GTX 1650 4GB GDDR6",price:48000,qty:1,discount:0}],
    48000, 48000, "card", makeDate(22, 15)),

  inv("INV-0035","receipt", null,
    [{id:"p015",name:"Logitech M100 USB Mouse",price:1200,qty:5,discount:0}],
    6000, 6000, "cash", makeDate(25, 12)),

  inv("INV-0034","invoice", C.priya,
    [{id:"p008",name:"Samsung 500GB SSD SATA",price:11500,qty:2,discount:500}],
    22500, 22500, "cash", makeDate(27, 9)),

  inv("INV-0033","invoice", C.kasun,
    [{id:"p013",name:"HP 15s Intel i5 8GB 512GB Laptop",price:128000,qty:1,discount:5000}],
    123000, 60000, "credit", makeDate(29, 14),
    { payments:[{amount:60000,method:"card",date:makeDate(29,14),note:"Partial payment"}] }),

  // ── PREVIOUS MONTH (for trend comparison) ────────────────────────
  inv("INV-0032","invoice", C.lasith,
    [{id:"p004",name:"Intel Core i7-12700K Processor",price:58000,qty:1,discount:0,warrantyMonths:36}],
    58000, 58000, "card", monthsAgo(1, 5, 10)),

  inv("INV-0031","invoice", C.nimal,
    [{id:"p005",name:"Kingston 8GB DDR4 3200MHz RAM",price:6500,qty:6,discount:2000}],
    37000, 37000, "cash", monthsAgo(1, 8, 11)),

  inv("INV-0030","invoice", C.chamara,
    [{id:"p012",name:"LG 24\" IPS 75Hz Monitor",price:35000,qty:2,discount:3000}],
    67000, 67000, "card", monthsAgo(1, 12, 14)),

  inv("INV-0029","invoice", C.nadun,
    [{id:"p003",name:"AMD Ryzen 5 5600X Processor",price:32000,qty:1,discount:0}],
    32000, 32000, "cash", monthsAgo(1, 15, 9)),

  inv("INV-0028","invoice", C.kasun,
    [{id:"p006",name:"Corsair 16GB DDR4 3200MHz RAM",price:12500,qty:2,discount:0},
     {id:"p019",name:"Corsair 550W 80+ Bronze PSU",price:9500,qty:1,discount:0}],
    34500, 34500, "cash", monthsAgo(1, 18, 15)),

  inv("INV-0027","invoice", C.roshan,
    [{id:"p009",name:"WD Green 240GB SSD",price:8500,qty:2,discount:0}],
    17000, 17000, "cash", monthsAgo(1, 22, 10)),

  inv("INV-0026","invoice", C.dilani,
    [{id:"p014",name:"Lenovo IdeaPad Slim 3 Ryzen 5",price:112000,qty:1,discount:0}],
    112000, 60000, "credit", monthsAgo(1, 25, 11),
    { payments:[{amount:60000,method:"cash",date:monthsAgo(1,25,11),note:"Advance"}] }),

  inv("INV-0025","receipt", null,
    [{id:"p015",name:"Logitech M100 USB Mouse",price:1200,qty:8,discount:500}],
    9100, 9100, "cash", monthsAgo(1, 28, 16)),

  // ── 2 MONTHS AGO ─────────────────────────────────────────────────
  inv("INV-0024","invoice", C.kasun,
    [{id:"p018",name:"NVIDIA GTX 1650 4GB GDDR6",price:48000,qty:1,discount:0}],
    48000, 48000, "card", monthsAgo(2, 10, 11)),

  inv("INV-0023","invoice", C.nimal,
    [{id:"p001",name:"Intel Core i5-12400F Processor",price:28500,qty:2,discount:2000}],
    55000, 55000, "cash", monthsAgo(2, 15, 14)),

  inv("INV-0022","invoice", C.samantha,
    [{id:"p011",name:"Samsung 21.5\" FHD LED Monitor",price:22500,qty:3,discount:0}],
    67500, 67500, "card", monthsAgo(2, 20, 10)),

  inv("INV-0021","invoice", C.chamara,
    [{id:"p013",name:"HP 15s Intel i5 8GB 512GB Laptop",price:128000,qty:1,discount:0}],
    128000, 128000, "cash", monthsAgo(2, 25, 15)),

  // ── 3 MONTHS AGO ─────────────────────────────────────────────────
  inv("INV-0020","invoice", C.lasith,
    [{id:"p004",name:"Intel Core i7-12700K Processor",price:58000,qty:1,discount:0}],
    58000, 58000, "card", monthsAgo(3, 8, 10)),

  inv("INV-0019","invoice", C.nadun,
    [{id:"p012",name:"LG 24\" IPS 75Hz Monitor",price:35000,qty:2,discount:3000}],
    67000, 67000, "cash", monthsAgo(3, 16, 14)),

  inv("INV-0018","invoice", C.dilani,
    [{id:"p006",name:"Corsair 16GB DDR4 3200MHz RAM",price:12500,qty:4,discount:0}],
    50000, 50000, "cash", monthsAgo(3, 24, 11)),

  // ── 4 MONTHS AGO ─────────────────────────────────────────────────
  inv("INV-0017","invoice", C.kasun,
    [{id:"p014",name:"Lenovo IdeaPad Slim 3 Ryzen 5",price:112000,qty:1,discount:5000}],
    107000, 107000, "card", monthsAgo(4, 10, 10)),

  inv("INV-0016","invoice", C.nimal,
    [{id:"p018",name:"NVIDIA GTX 1650 4GB GDDR6",price:48000,qty:2,discount:4000}],
    92000, 92000, "cash", monthsAgo(4, 20, 14)),

  // ── 5 MONTHS AGO ─────────────────────────────────────────────────
  inv("INV-0015","invoice", C.roshan,
    [{id:"p013",name:"HP 15s Intel i5 8GB 512GB Laptop",price:128000,qty:1,discount:0}],
    128000, 128000, "card", monthsAgo(5, 5, 10)),

  inv("INV-0014","invoice", C.chamara,
    [{id:"p001",name:"Intel Core i5-12400F Processor",price:28500,qty:3,discount:3000}],
    82500, 82500, "cash", monthsAgo(5, 18, 15)),

  // ── 6 MONTHS AGO ─────────────────────────────────────────────────
  inv("INV-0013","invoice", C.kasun,
    [{id:"p004",name:"Intel Core i7-12700K Processor",price:58000,qty:1,discount:0}],
    58000, 58000, "card", monthsAgo(6, 12, 11)),

  inv("INV-0012","invoice", C.lasith,
    [{id:"p011",name:"Samsung 21.5\" FHD LED Monitor",price:22500,qty:4,discount:2000}],
    88000, 88000, "cash", monthsAgo(6, 22, 14)),

  // ── 7-11 MONTHS AGO (for year chart) ─────────────────────────────
  inv("INV-0011","invoice", C.nimal,
    [{id:"p014",name:"Lenovo IdeaPad Slim 3 Ryzen 5",price:112000,qty:1,discount:0}],
    112000, 112000, "card", monthsAgo(7, 15, 10)),

  inv("INV-0010","invoice", C.kasun,
    [{id:"p018",name:"NVIDIA GTX 1650 4GB GDDR6",price:48000,qty:1,discount:0}],
    48000, 48000, "cash", monthsAgo(8, 8, 11)),

  inv("INV-0009","invoice", C.chamara,
    [{id:"p013",name:"HP 15s Intel i5 8GB 512GB Laptop",price:128000,qty:1,discount:3000}],
    125000, 125000, "card", monthsAgo(9, 20, 14)),

  inv("INV-0008","invoice", C.nadun,
    [{id:"p001",name:"Intel Core i5-12400F Processor",price:28500,qty:2,discount:1000}],
    56000, 56000, "cash", monthsAgo(10, 10, 10)),

  inv("INV-0007","invoice", C.roshan,
    [{id:"p012",name:"LG 24\" IPS 75Hz Monitor",price:35000,qty:2,discount:0}],
    70000, 70000, "card", monthsAgo(11, 15, 15)),
];

const DEMO_EXPENSES = [
  { id:"e001", description:"Shop Monthly Rent", amount:35000, category:"Rent", date:daysAgo(5), paymentMethod:"bank" },
  { id:"e002", description:"Electricity Bill", amount:8500, category:"Utilities", date:daysAgo(6), paymentMethod:"cash" },
  { id:"e003", description:"Internet (Dialog Broadband)", amount:4500, category:"Utilities", date:daysAgo(8), paymentMethod:"bank" },
  { id:"e004", description:"Stock Purchase - Processors", amount:185000, category:"Inventory", date:daysAgo(10), paymentMethod:"bank" },
  { id:"e005", description:"Stock Purchase - RAM & SSDs", amount:95000, category:"Inventory", date:daysAgo(10), paymentMethod:"bank" },
  { id:"e006", description:"Water Bill", amount:1200, category:"Utilities", date:daysAgo(12), paymentMethod:"cash" },
  { id:"e007", description:"Staff Salary - Kasun (Technician)", amount:45000, category:"Salary", date:daysAgo(15), paymentMethod:"bank" },
  { id:"e008", description:"Packaging Materials", amount:3500, category:"Supplies", date:daysAgo(18), paymentMethod:"cash" },
  { id:"e009", description:"Advertisement - Facebook Ads", amount:7500, category:"Marketing", date:daysAgo(20), paymentMethod:"bank" },
  { id:"e010", description:"Office Supplies (Stationery)", amount:2200, category:"Supplies", date:daysAgo(22), paymentMethod:"cash" }
];

const DEMO_SUPPLIERS = [
  { id:"s001", name:"Micro Technologies Pvt Ltd", contact:"Saman Kumara", phone:"+94 11 250 0000", email:"sales@microtech.lk", address:"Colombo 03" },
  { id:"s002", name:"PC World Lanka", contact:"Ravi Fernando", phone:"+94 11 420 3000", email:"orders@pcworld.lk", address:"Colombo 07" },
  { id:"s003", name:"Data One Systems", contact:"Niluka Silva", phone:"+94 11 580 1234", email:"info@dataone.lk", address:"Colombo 01" }
];

const DEMO_SETTINGS = {
  businessName: "SD Computers",
  businessAddress: "88V3+78G, Main Street, Polgahawela",
  businessPhone: "+94 70 700 3608",
  businessEmail: "sdcomputers@gmail.com",
  businessTagline: "Smart Computer Store",
  timezone: "Asia/Colombo",
  currencySymbol: "Rs",
  currencyCode: "LKR",
  currencyLocale: "si-LK",
  defaultTaxPercent: 0,
  lowStockThreshold: 5,
  invoiceFooter: "Thank you for shopping at SD Computers! Visit us again.",
  invoiceHeaderColor: "#1e3a5f",
  invoiceWatermark: "",
  invoiceShowQR: false,
  receiptHeaderColor: "#1e3a5f",
  receiptFooter: "Thank you! Come again.",
  receiptNote: "All sales are final. Warranty claims with receipt only.",
  receiptShowTax: false,
  receiptShowDiscount: true,
  appName: "SD POS",
  mistralApiKey: "",
  mistralModel: "",
  loyaltyEnabled: true,
  loyaltyEarnRate: 100,
  loyaltyRedeemRate: 50,
  eodReportEnabled: false,
  birthdayGreetEnabled: false,
  githubBackupEnabled: false,
  waAutoReply: false,
  logoUrl: "https://files.catbox.moe/w09oor.JPG"
};

const DEMO_QUOTATIONS = [
  {
    id:"QUO-0003", status:"sent",
    customer:{name:"Nimal Fernando",phone:"+94 78 111 2233",email:"nimal@gmail.com"},
    items:[{id:"p018",name:"NVIDIA GTX 1650 4GB GDDR6",price:48000,qty:1,discount:0},{id:"p006",name:"Corsair 16GB DDR4 3200MHz RAM",price:12500,qty:2,discount:0}],
    subtotal:73000, discount:0, tax:0, total:73000,
    validUntil: new Date(Date.now()+5*86400000).toISOString().split('T')[0],
    notes:"Gaming PC upgrade package", createdAt:daysAgo(2)
  },
  {
    id:"QUO-0002", status:"accepted",
    customer:{name:"Kasun Perera",phone:"+94 77 234 5678",email:"kasun@gmail.com"},
    items:[{id:"p013",name:"HP 15s Intel i5 8GB 512GB Laptop",price:128000,qty:1,discount:5000}],
    subtotal:128000, discount:5000, tax:0, total:123000,
    validUntil:daysAgo(0).split('T')[0],
    notes:"Special price for loyal customer", createdAt:daysAgo(6)
  },
  {
    id:"QUO-0001", status:"expired",
    customer:{name:"Dilani Jayawardena",phone:"+94 76 789 0123",email:"dilani@yahoo.com"},
    items:[{id:"p011",name:"Samsung 21.5\" FHD LED Monitor",price:22500,qty:2,discount:0}],
    subtotal:45000, discount:0, tax:0, total:45000,
    validUntil:daysAgo(10).split('T')[0],
    notes:"Office monitors", createdAt:daysAgo(20)
  }
];

const DEMO_SHIFTS = [
  {
    id:"sh001", status:"closed",
    openedAt:daysAgo(1), closedAt:daysAgo(0),
    openingCash:5000, closingCash:47500,
    cashSales:42300, variance:200,
    openedBy:"demo", closedBy:"demo", notes:"Normal trading day"
  }
];

const DEMO_PURCHASES = [];
const DEMO_RETURNS = [];
const DEMO_LOYALTY = [];
const DEMO_DISCOUNTS = [
  { id:"dc001", code:"WELCOME10", type:"percent", value:10, minOrder:0, used:5, active:true },
  { id:"dc002", code:"VIP500", type:"fixed", value:500, minOrder:5000, used:12, active:true }
];

// ── 3. Fetch Interceptor ─────────────────────────────────────
(function installFetchMock() {
  const _real = window.fetch.bind(window);

  function mockResponse(data, status = 200) {
    const body = JSON.stringify(data);
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  function urlMatch(url, pattern) {
    if (typeof pattern === "string") return url === pattern || url.startsWith(pattern + "?");
    if (pattern instanceof RegExp) return pattern.test(url);
    return false;
  }

  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = (init.method || "GET").toUpperCase();

    // ── Auth & session ──────────────────────────────────────
    if (url.includes("/api/auth/check"))
      return mockResponse({ ok: true, username: "demo", role: "admin" });

    if (url.includes("/api/auth/login"))
      return mockResponse({ ok: true, token: "demo-token-2024", user: { username:"demo", fullName:"Demo Admin", role:"admin" } });

    if (url.includes("/api/auth/logout"))
      return mockResponse({ ok: true });

    if (url.includes("/api/profile"))
      return mockResponse({ ok: true, user: { username:"demo", fullName:"Demo Admin", role:"admin", email:"demo@sdcomputers.lk" } });

    // ── Generic data endpoints ──────────────────────────────
    if (url.match(/\/api\/data\/(\w+)/)) {
      const type = url.match(/\/api\/data\/(\w+)/)[1];
      if (method === "POST") return mockResponse({ ok: true });
      const map = {
        products: DEMO_PRODUCTS,
        customers: DEMO_CUSTOMERS,
        invoices: DEMO_INVOICES,
        expenses: DEMO_EXPENSES,
        categories: DEMO_CATEGORIES,
        discounts: DEMO_DISCOUNTS,
        purchasing: DEMO_PURCHASES,
        quotations: DEMO_QUOTATIONS,
        shifts: DEMO_SHIFTS,
        suppliers: DEMO_SUPPLIERS,
        returns: DEMO_RETURNS,
        loyalty: DEMO_LOYALTY,
      };
      return mockResponse(map[type] || []);
    }

    // ── Settings ────────────────────────────────────────────
    if (url.includes("/api/settings")) {
      if (method === "POST" || method === "PUT") return mockResponse({ ok: true });
      return mockResponse(DEMO_SETTINGS);
    }

    // ── Employers ───────────────────────────────────────────
    if (url.includes("/api/employers")) {
      return mockResponse({ ok: true, users: [
        { id:"u001", username:"demo", fullName:"Demo Admin", role:"admin", email:"demo@sdcomputers.lk", permissions:[] },
        { id:"u002", username:"cashier1", fullName:"Kasun (Cashier)", role:"cashier", email:"cashier@sd.lk", permissions:["billing","invoices"] }
      ]});
    }

    // ── WhatsApp ────────────────────────────────────────────
    if (url.includes("/api/whatsapp/status"))
      return mockResponse({ ok: true, status: "disconnected", message: "Demo mode — WhatsApp not connected" });

    if (url.includes("/api/whatsapp/")) return mockResponse({ ok: true, message: "Demo mode" });

    // ── Chat ────────────────────────────────────────────────
    if (url.includes("/api/chat/")) return mockResponse({ ok: true, users: [], messages: [] });

    // ── Invoice / PDF generation ─────────────────────────────
    if (url.includes("/api/invoice-pdf") || url.includes("/api/send-email"))
      return mockResponse({ ok: true, message: "Demo mode — PDF/email disabled" });

    // ── Analytics / Insights ────────────────────────────────
    if (url.includes("/api/insights"))
      return mockResponse({ ok: true, summary: "🎯 Demo Insights: Today's revenue is Rs 53,000 with 2 transactions. Top seller: Intel Core i5-12400F. Stock is healthy across all categories." });

    // ── Spam / blocked ──────────────────────────────────────
    if (url.includes("/api/spam/")) return mockResponse({ ok: true, blocked: [], log: [] });

    // ── Backup / GitHub ─────────────────────────────────────
    if (url.includes("/api/github-backup") || url.includes("/api/backup") || url.includes("/api/eod-report"))
      return mockResponse({ ok: true, message: "Demo mode" });

    // ── Upload (logo etc.) ──────────────────────────────────
    if (url.includes("/api/upload-"))
      return mockResponse({ ok: true, url: "" });

    // ── Advance payments ─────────────────────────────────────
    if (url.includes("/api/advance") || url.includes("/api/data/advance"))
      return mockResponse({ ok: true, advances: [] });

    // ── Fallback for any other /api/ call ────────────────────
    if (url.includes("/api/"))
      return mockResponse({ ok: true });

    // ── Static / external — pass through ────────────────────
    return _real(input, init);
  };
})();

// ── 4. Demo banner ───────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const banner = document.createElement("div");
  banner.id = "demo-banner";
  banner.innerHTML = `
    <i class="fas fa-flask" style="margin-right:6px;"></i>
    <strong>DEMO MODE</strong> &nbsp;—&nbsp; This is a live interactive demo with sample data.
    All changes are local only.(90% same).
    <a href="https://wa.me/94760405102?text=Hi%2C%20I%20saw%20your%20Zyphra%20POS%20demo%20and%20I%27m%20interested!" target="_blank" style="color:#fde68a;margin-left:12px;font-weight:600;">
      Contact us for Full Version &rarr;
    </a>
    <button onclick="this.parentElement.remove()" style="margin-left:16px;background:rgba(255,255,255,.15);border:none;color:#fff;padding:2px 10px;border-radius:4px;cursor:pointer;font-size:12px;">✕</button>
  `;
  banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,#1e40af,#7c3aed);color:#fff;padding:8px 16px;font-size:13px;text-align:center;display:flex;align-items:center;justify-content:center;gap:4px;";
  document.body.prepend(banner);

  // Push sidebar/content down so banner doesn't overlap
  document.body.style.paddingTop = "38px";
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) sidebar.style.top = "38px";
  const app = document.querySelector(".app");
  if (app) app.style.marginTop = "0";
});
