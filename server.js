require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const escape = require("escape-html");
const { v4: uuidv4 } = require("uuid");
const { Configuration, PlaidEnvironments, PlaidApi } = require("plaid");
const { setTimeout: sleep } = require("timers/promises");
const path = require("path");
const db = require("./db");

// Ensure we run relative to this file's directory so paths work regardless
// of where Node is launched from
process.chdir(__dirname);

const APP_PORT = process.env.APP_PORT || 8000;
const PLAID_ENV = (process.env.PLAID_ENV || "sandbox").toLowerCase();

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
      "Plaid-Version": "2020-09-14",
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

const app = express();
app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.static("./public"));

const getLoggedInUserId = (req) => req.cookies["signedInUser"];

// ── USER ROUTES ──────────────────────────────────────────────────────────────

app.post("/api/users/create", async (req, res, next) => {
  try {
    const username = escape(req.body.username);
    if (!username) return res.status(400).json({ error: "Username required" });
    const userId = uuidv4();
    const result = await db.addUser(userId, username);
    if (result.lastID != null) {
      res.cookie("signedInUser", userId, {
        maxAge: 1000 * 60 * 60 * 24 * 30,
        httpOnly: true,
      });
    }
    res.json({ success: true, userId, username });
  } catch (err) {
    next(err);
  }
});

app.get("/api/users/list", async (req, res, next) => {
  try {
    res.json(await db.getUserList());
  } catch (err) {
    next(err);
  }
});

app.post("/api/users/sign_in", async (req, res, next) => {
  try {
    const userId = escape(req.body.userId);
    res.cookie("signedInUser", userId, {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
    });
    res.json({ signedIn: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/users/sign_out", async (req, res, next) => {
  try {
    res.clearCookie("signedInUser");
    res.json({ signedOut: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/users/me", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    if (!userId) return res.json({ userInfo: null });
    const user = await db.getUserRecord(userId);
    if (!user) {
      res.clearCookie("signedInUser");
      return res.json({ userInfo: null });
    }
    res.json({ userInfo: { id: user.id, username: user.username } });
  } catch (err) {
    next(err);
  }
});

// ── TOKEN ROUTES ─────────────────────────────────────────────────────────────

app.post("/api/tokens/link_token", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    const tokenResponse = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      products: ["transactions"],
      client_name: "FinView Sandbox Demo",
      language: "en",
      country_codes: ["US"],
    });
    res.json(tokenResponse.data);
  } catch (err) {
    next(err);
  }
});

app.post("/api/tokens/exchange", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    const publicToken = escape(req.body.publicToken);

    const tokenResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const { item_id: itemId, access_token: accessToken } = tokenResponse.data;

    await db.addItem(itemId, userId, accessToken);

    // Fetch and store bank name
    try {
      const itemResp = await plaidClient.itemGet({ access_token: accessToken });
      const institutionId = itemResp.data.item.institution_id;
      if (institutionId) {
        const instResp = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: ["US"],
        });
        await db.addBankNameForItem(itemId, instResp.data.institution.name);
      }
    } catch (e) {
      console.warn("Could not fetch bank name:", e.message);
    }

    // Fetch and store account names
    try {
      const acctsResp = await plaidClient.accountsGet({
        access_token: accessToken,
      });
      await Promise.all(
        acctsResp.data.accounts.map((acct) =>
          db.addAccount(acct.account_id, itemId, acct.name)
        )
      );
    } catch (e) {
      console.warn("Could not fetch accounts:", e.message);
    }

    // Initial transaction sync
    await syncTransactions(itemId);

    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
});

// ── BANK ROUTES ───────────────────────────────────────────────────────────────

app.get("/api/banks/list", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    res.json(await db.getBankNamesForUser(userId));
  } catch (err) {
    next(err);
  }
});

app.post("/api/banks/deactivate", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    const itemId = req.body.itemId;
    const itemInfo = await db.getItemInfoForUser(itemId, userId);
    if (!itemInfo) return res.status(403).json({ error: "Not authorized" });
    await plaidClient.itemRemove({ access_token: itemInfo.access_token });
    await db.deactivateItem(itemId);
    res.json({ removed: itemId });
  } catch (err) {
    next(err);
  }
});

// ── TRANSACTION ROUTES ────────────────────────────────────────────────────────

const fetchNewSyncData = async (accessToken, initialCursor, retriesLeft = 3) => {
  const allData = {
    added: [],
    modified: [],
    removed: [],
    nextCursor: initialCursor,
  };
  if (retriesLeft <= 0) return allData;
  try {
    let keepGoing = false;
    do {
      const results = await plaidClient.transactionsSync({
        access_token: accessToken,
        options: { include_personal_finance_category: true },
        cursor: allData.nextCursor,
      });
      const d = results.data;
      allData.added = allData.added.concat(d.added);
      allData.modified = allData.modified.concat(d.modified);
      allData.removed = allData.removed.concat(d.removed);
      allData.nextCursor = d.next_cursor;
      keepGoing = d.has_more;
      console.log(
        `Sync page — added:${d.added.length} modified:${d.modified.length} removed:${d.removed.length}`
      );
    } while (keepGoing);
    return allData;
  } catch (err) {
    console.error("Sync error, retrying:", err.message);
    await sleep(1000);
    return fetchNewSyncData(accessToken, initialCursor, retriesLeft - 1);
  }
};

const syncTransactions = async (itemId) => {
  const {
    access_token: accessToken,
    transaction_cursor: transactionCursor,
    user_id: userId,
  } = await db.getItemInfo(itemId);

  const summary = { added: 0, modified: 0, removed: 0 };
  const allData = await fetchNewSyncData(accessToken, transactionCursor);

  await Promise.all(
    allData.added.map(async (t) => {
      const result = await db.addNewTransaction({
        id: t.transaction_id,
        userId,
        accountId: t.account_id,
        category: t.personal_finance_category?.primary ?? "OTHER",
        date: t.date,
        authorizedDate: t.authorized_date,
        name: t.merchant_name ?? t.name,
        amount: t.amount,
        currencyCode: t.iso_currency_code,
        pendingTransactionId: t.pending_transaction_id,
      });
      if (result) summary.added += result.changes;
    })
  );

  await Promise.all(
    allData.modified.map(async (t) => {
      const result = await db.modifyExistingTransaction({
        id: t.transaction_id,
        userId,
        accountId: t.account_id,
        category: t.personal_finance_category?.primary ?? "OTHER",
        date: t.date,
        authorizedDate: t.authorized_date,
        name: t.merchant_name ?? t.name,
        amount: t.amount,
        currencyCode: t.iso_currency_code,
      });
      if (result) summary.modified += result.changes;
    })
  );

  await Promise.all(
    allData.removed.map(async (t) => {
      const result = await db.markTransactionAsRemoved(t.transaction_id);
      if (result) summary.removed += result.changes;
    })
  );

  await db.saveCursorForItem(allData.nextCursor, itemId);
  console.log("Sync complete:", summary);
  return summary;
};

app.post("/api/transactions/sync", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    const items = await db.getItemIdsForUser(userId);
    const results = await Promise.all(
      items.map((item) => syncTransactions(item.id))
    );
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

app.get("/api/transactions/list", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    const maxCount = parseInt(req.query.maxCount) || 50;
    const transactions = await db.getTransactionsForUser(userId, maxCount);
    res.json(transactions);
  } catch (err) {
    next(err);
  }
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error(err);
  if (err.response?.data) {
    res.status(500).json(err.response.data);
  } else {
    res.status(500).json({
      error_code: "SERVER_ERROR",
      error_message: err.message || "Unknown server error",
    });
  }
});

app.listen(APP_PORT, () => {
  console.log(`FinView Sandbox Demo → http://localhost:${APP_PORT}/`);
});
