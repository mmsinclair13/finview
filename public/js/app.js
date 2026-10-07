/* FinView – Sandbox Demo client */

// ── API helpers ───────────────────────────────────────────────────────────────
const api = {
  get: async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_message || `HTTP ${res.status}`);
    }
    return res.json();
  },
  post: async (url, body = null) => {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_message || `HTTP ${res.status}`);
    }
    return res.json();
  },
};

// ── UI helpers ────────────────────────────────────────────────────────────────
const show = (id) => document.getElementById(id)?.classList.remove("d-none");
const hide = (id) => document.getElementById(id)?.classList.add("d-none");
const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

function showLoading(msg = "Loading…") {
  setText("loadingMessage", msg);
  show("loadingOverlay");
}
function hideLoading() { hide("loadingOverlay"); }

function showError(msg) {
  const el = document.getElementById("errorAlert");
  el.textContent = msg;
  el.classList.remove("d-none");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("d-none"), 5000);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// ── Formatting ────────────────────────────────────────────────────────────────
function formatCategory(cat) {
  if (!cat) return "Other";
  return cat
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function categoryClass(cat) {
  const map = {
    FOOD_AND_DRINK: "cat-FOOD_AND_DRINK",
    TRANSPORTATION: "cat-TRANSPORTATION",
    SHOPPING: "cat-SHOPPING",
    GENERAL_MERCHANDISE: "cat-GENERAL_MERCHANDISE",
    ENTERTAINMENT: "cat-ENTERTAINMENT",
    INCOME: "cat-INCOME",
    TRANSFER_IN: "cat-TRANSFER_IN",
    TRANSFER_OUT: "cat-TRANSFER_OUT",
  };
  return map[cat] || "cat-OTHER";
}

function formatCurrency(amount, code = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code || "USD",
    }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function createAccount() {
  const input = document.getElementById("usernameInput");
  const username = input.value.trim();
  if (!username) { showError("Please enter your name."); return; }
  try {
    showLoading("Creating your account…");
    await api.post("/api/users/create", { username });
    input.value = "";
    await checkSession();
  } catch (e) {
    showError(e.message);
  } finally {
    hideLoading();
  }
}

async function signIn() {
  const userId = document.getElementById("existingUsersSelect").value;
  if (!userId) return;
  try {
    showLoading("Signing in…");
    await api.post("/api/users/sign_in", { userId });
    await checkSession();
  } catch (e) {
    showError(e.message);
  } finally {
    hideLoading();
  }
}

async function signOut() {
  await api.post("/api/users/sign_out");
  hide("dashboard");
  show("loginSection");
  await loadExistingUsers();
}

async function checkSession() {
  try {
    const { userInfo } = await api.get("/api/users/me");
    if (!userInfo) {
      show("loginSection");
      hide("dashboard");
      await loadExistingUsers();
    } else {
      hide("loginSection");
      show("dashboard");
      // Welcome message + avatar
      setText("welcomeMessage", `Signed in as ${userInfo.username}`);
      const initial = userInfo.username.charAt(0).toUpperCase();
      setText("userAvatar", initial);
      await refreshBanks();
      await refreshTransactions();
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadExistingUsers() {
  try {
    const users = await api.get("/api/users/list");
    if (users.length === 0) {
      hide("existingUsersSection");
    } else {
      show("existingUsersSection");
      setHTML(
        "existingUsersSelect",
        users
          .map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.username)}</option>`)
          .join("")
      );
    }
  } catch (e) {
    console.error(e);
  }
}

// ── Plaid Link ────────────────────────────────────────────────────────────────
async function connectToBank() {
  try {
    showLoading("Opening bank connection…");
    const tokenData = await api.post("/api/tokens/link_token");
    hideLoading();

    const handler = Plaid.create({
      token: tokenData.link_token,
      onSuccess: async (publicToken, metadata) => {
        console.log("Plaid onSuccess", metadata);
        showLoading("Connecting bank & importing transactions…");
        try {
          await api.post("/api/tokens/exchange", { publicToken });
          await refreshBanks();
          await refreshTransactions();
        } catch (e) {
          showError("Bank connected but could not fetch data: " + e.message);
        } finally {
          hideLoading();
        }
      },
      onExit: (err, metadata) => {
        hideLoading();
        if (err) console.warn("Plaid exit error:", err);
      },
      onEvent: (name, metadata) => console.log("Plaid event:", name),
    });
    handler.open();
  } catch (e) {
    hideLoading();
    showError("Could not start bank connection: " + e.message);
  }
}

// ── Banks ─────────────────────────────────────────────────────────────────────
async function refreshBanks() {
  try {
    const banks = await api.get("/api/banks/list");
    const listEl = document.getElementById("banksList");
    const deactivateSelect = document.getElementById("deactivateBankSelect");

    setText("bankCount", banks.length);

    if (banks.length === 0) {
      listEl.innerHTML = `<p class="text-muted small text-center py-2">No banks connected yet</p>`;
      hide("deactivateSection");
    } else {
      listEl.innerHTML = banks
        .map(
          (b) => `
          <div class="bank-card">
            <span class="bank-icon">🏦</span>
            <div>
              <div class="bank-name">${escapeHtml(b.bank_name || "Unknown Bank")}</div>
              <div class="bank-sub">Connected · Sandbox</div>
            </div>
          </div>`
        )
        .join("");

      deactivateSelect.innerHTML = banks
        .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.bank_name || "Unknown")}</option>`)
        .join("");
      show("deactivateSection");
    }

    document.getElementById("connectToBank").textContent =
      banks.length > 0 ? "🏦 Connect Another Bank" : "🏦 Connect to Chase";
  } catch (e) {
    console.error(e);
  }
}

async function deactivateBank() {
  const itemId = document.getElementById("deactivateBankSelect").value;
  if (!itemId) return;
  if (!confirm("Disconnect this bank? Your transaction history will be preserved.")) return;
  try {
    showLoading("Disconnecting bank…");
    await api.post("/api/banks/deactivate", { itemId });
    await refreshBanks();
    await refreshTransactions();
  } catch (e) {
    showError(e.message);
  } finally {
    hideLoading();
  }
}

// ── Transactions ──────────────────────────────────────────────────────────────
async function syncTransactions() {
  try {
    showLoading("Syncing latest transactions…");
    await api.post("/api/transactions/sync");
    await refreshTransactions();
  } catch (e) {
    showError(e.message);
  } finally {
    hideLoading();
  }
}

async function refreshTransactions() {
  try {
    const txns = await api.get("/api/transactions/list?maxCount=100");
    renderTransactions(txns);
    await loadTrendHistory();
  } catch (e) {
    console.error(e);
  }
}

function renderTransactions(txns) {

  const tbody = document.getElementById("transactionTableBody");
  const statsEl = document.getElementById("transactionStats");

  if (!txns || txns.length === 0) {
    statsEl.innerHTML = "";
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-5">
          <div style="font-size:2rem">🏦</div>
          Connect a bank and press <strong>Sync</strong> to see transactions
        </td>
      </tr>`;
    return;
  }

  // ── Stats ──
  const debits = txns.filter((t) => t.amount > 0);
  const credits = txns.filter((t) => t.amount < 0);
  const totalSpent = debits.reduce((s, t) => s + t.amount, 0);
  const totalIncome = credits.reduce((s, t) => s + Math.abs(t.amount), 0);

  const catCounts = {};
  txns.forEach((t) => {
    const c = t.category || "OTHER";
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  statsEl.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value amount-positive">${formatCurrency(totalSpent)}</div>
        <div class="stat-label">Total Spent</div>
      </div>
      <div class="stat-card">
        <div class="stat-value amount-negative">${formatCurrency(totalIncome)}</div>
        <div class="stat-label">Income / Credits</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${txns.length}</div>
        <div class="stat-label">Transactions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:.85rem">${topCat ? formatCategory(topCat[0]) : "—"}</div>
        <div class="stat-label">Top Category</div>
      </div>
    </div>`;

  // ── Table rows ──
  tbody.innerHTML = txns
    .map((t) => {
      const isCredit = t.amount < 0;
      return `
        <tr>
          <td class="text-nowrap text-muted" style="font-size:.8rem">${escapeHtml(t.date)}</td>
          <td class="fw-medium">${escapeHtml(t.name || "")}</td>
          <td>
            <span class="cat-badge ${categoryClass(t.category)}">
              ${escapeHtml(formatCategory(t.category))}
            </span>
          </td>
          <td class="text-end fw-semibold ${isCredit ? "amount-negative" : "amount-positive"}">
            ${isCredit ? "+" : ""}${formatCurrency(Math.abs(t.amount), t.currency_code)}
          </td>
          <td class="text-muted" style="font-size:.78rem">
            ${escapeHtml(t.bank_name || "")}
            <br/>${escapeHtml(t.account_name || "")}
          </td>
        </tr>`;
    })
    .join("");
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("createAccountBtn").addEventListener("click", createAccount);
  document.getElementById("signInBtn").addEventListener("click", signIn);
  document.getElementById("signOutBtn").addEventListener("click", signOut);
  document.getElementById("connectToBank").addEventListener("click", connectToBank);
  document.getElementById("syncBtn").addEventListener("click", syncTransactions);
  document.getElementById("deactivateBankBtn").addEventListener("click", deactivateBank);
  document.getElementById("categoryView").addEventListener("change", renderCategoryChart);

  document.getElementById("usernameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createAccount();
  });

  await checkSession();
});

function renderOverview(transactions) {
  // Keep totals in one currency rather than adding unlike currencies together.
  const currency = transactions[0]?.currency_code || "USD";
  const txns = transactions.filter(t => (t.currency_code || "USD") === currency);
  const spent = txns.reduce((sum, t) => sum + Math.max(0, Number(t.amount) || 0), 0);
  const credits = txns.reduce((sum, t) => sum + Math.max(0, -(Number(t.amount) || 0)), 0);
  const money = value => formatCurrency(value, currency);
  const metrics = [
    ["Money out", money(spent), "Spending & outgoing transfers", ""],
    ["Money in", money(credits), "Credits & incoming transfers", "metric-credit"],
    ["Net flow", money(credits - spent), "Money in minus money out", ""],
    ["Transactions", String(txns.length), `Loaded records · ${currency}`, ""]
  ];
  setHTML("overviewMetrics", metrics.map(([label, value, detail, cls]) => `<article class="card overview-metric"><span class="metric-label">${escapeHtml(label)}</span><strong class="${cls}">${escapeHtml(value)}</strong><span class="metric-detail">${escapeHtml(detail)}</span></article>`).join(""));
  const days = {};
  const categories = {};
  txns.forEach(t => {
    if (t.date) days[t.date] = (days[t.date] || 0) + Math.max(0, Number(t.amount) || 0);
    if (t.amount > 0) categories[t.category || "OTHER"] = (categories[t.category || "OTHER"] || 0) + Number(t.amount);
  });
  const dates = Object.keys(days).sort();
  const max = Math.max(1, ...Object.values(days));
  setText("overviewPeriod", dates.length ? `${dates[0]} — ${dates[dates.length - 1]}` : "Awaiting your first connection");
  setHTML("overviewChart", dates.length ? `<div class="chart-bars" role="img" aria-label="Daily spending in ${escapeHtml(currency)}. ${dates.length} dates with transactions.">${dates.map(date => `<div class="chart-bar-track"><div class="chart-bar" style="height:${Math.max(1, days[date] / max * 100)}%" title="${escapeHtml(date)}: ${escapeHtml(money(days[date]))}"></div></div>`).join("")}</div>` : '<div class="overview-empty"><span class="empty-chart-icon">▥</span><strong>Your spending story starts here</strong><span>Connect a bank to see your activity.</span></div>');
  setHTML("overviewDates", dates.length ? `<span>${escapeHtml(dates[0])}</span><span>${escapeHtml(currency)} · Hover bars for amounts</span><span>${escapeHtml(dates[dates.length - 1])}</span>` : "");
  categoryChartData = { categories, spent, currency };
  renderCategoryChart();
}

let categoryChartData = { categories: {}, spent: 0, currency: "USD" };

function renderCategoryChart() {
  const { categories, spent, currency } = categoryChartData;
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || !spent) {
    setHTML("overviewCategories", '<div class="overview-empty"><strong>No spending yet</strong><span>Your top categories will appear here.</span></div>');
    return;
  }
  const money = value => formatCurrency(value, currency);
  const pie = document.getElementById("categoryView").value === "pie";
  const entries = sorted.slice(0, 5).map(([category, amount]) => [formatCategory(category), amount]);
  if (pie && sorted.length > 5) entries.push(["Remaining categories", sorted.slice(5).reduce((sum, entry) => sum + entry[1], 0)]);
  const colors = ["#d8e0e9", "#8d9daf", "#64778d", "#465a70", "#b6b2c4", "#343e4c"];
  let cumulative = 0;
  const slices = entries.map(([, amount], index) => {
    const start = cumulative;
    cumulative += amount / spent * 100;
    return `${colors[index]} ${start}% ${cumulative}%`;
  });
  const legend = entries.map(([label, amount], index) => `<div class="category-item"><div class="category-caption"><span>${pie ? `<i class="pie-swatch" style="background:${colors[index]}"></i>` : ""}${escapeHtml(label)}</span><strong>${escapeHtml(money(amount))}</strong></div>${pie ? "" : `<div class="category-track"><div style="width:${amount / spent * 100}%"></div></div>`}<span class="category-share">${(amount / spent * 100).toFixed(1)}% of outflows</span></div>`).join("");
  const description = entries.map(([label, amount]) => `${label}: ${money(amount)}, ${(amount / spent * 100).toFixed(1)}%`).join("; ");
  setHTML("overviewCategories", `${pie ? `<div class="category-pie" role="img" aria-label="${escapeHtml('Spending by category. ' + description)}" style="background:conic-gradient(${slices.join(',')})"></div><p class="pie-total">Total outflows <strong>${escapeHtml(money(spent))}</strong></p>` : ""}<div class="category-breakdown">${legend}</div>`);
}