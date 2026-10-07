const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const dbWrapper = require("sqlite");
const crypto = require("crypto");

const path = require("path");
const databaseDirectory = process.env.DATA_DIR || path.join(__dirname, "database");
const databaseFile = path.join(databaseDirectory, "appdata.db");
let db;

fs.mkdirSync(databaseDirectory, { recursive: true });
const existingDatabase = fs.existsSync(databaseFile);

const ready = dbWrapper
  .open({ filename: databaseFile, driver: sqlite3.Database })
  .then(async (dBase) => {
    db = dBase;
    if (!existingDatabase) {
      await db.run(
        "CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL)"
      );
      await db.run(
        "CREATE TABLE items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, " +
          "access_token TEXT NOT NULL, transaction_cursor TEXT, bank_name TEXT, " +
          "is_active INTEGER DEFAULT 1, FOREIGN KEY(user_id) REFERENCES users(id))"
      );
      await db.run(
        "CREATE TABLE accounts (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, " +
          "name TEXT, FOREIGN KEY(item_id) REFERENCES items(id))"
      );
      await db.run(
        "CREATE TABLE transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, " +
          "account_id TEXT, category TEXT, date TEXT, authorized_date TEXT, " +
          "name TEXT, amount REAL, currency_code TEXT, is_removed INTEGER DEFAULT 0, " +
          "FOREIGN KEY(user_id) REFERENCES users(id), " +
          "FOREIGN KEY(account_id) REFERENCES accounts(id))"
      );
      console.log("Database created successfully.");
    } else {
      console.log("Database loaded.");
    }
  })
  .then(() => require("./demo-data").seedDemo(db));

const addUser = async (userId, username) =>
  db.run(`INSERT INTO users(id, username) VALUES(?, ?)`, userId, username);

const getUserList = async () =>
  db.all(`SELECT id, username FROM users ORDER BY (username='test') DESC, rowid DESC`);

const getUserRecord = async (userId) =>
  db.get(`SELECT * FROM users WHERE id=?`, userId);

const addItem = async (itemId, userId, accessToken) =>
  db.run(
    `INSERT INTO items(id, user_id, access_token) VALUES(?, ?, ?)`,
    itemId,
    userId,
    accessToken
  );

const addBankNameForItem = async (itemId, bankName) =>
  db.run(`UPDATE items SET bank_name=? WHERE id=?`, bankName, itemId);

const getBankNamesForUser = async (userId) =>
  db.all(
    `SELECT id, bank_name FROM items WHERE user_id=? AND is_active=1`,
    userId
  );

const getItemIdsForUser = async (userId) =>
  db.all(`SELECT id FROM items WHERE user_id=? AND is_active=1`, userId);

const getItemInfo = async (itemId) =>
  db.get(
    `SELECT user_id, access_token, transaction_cursor FROM items WHERE id=?`,
    itemId
  );

const getItemInfoForUser = async (itemId, userId) =>
  db.get(
    `SELECT user_id, access_token, transaction_cursor FROM items WHERE id=? AND user_id=?`,
    itemId,
    userId
  );

const deactivateItem = async (itemId) =>
  db.run(
    `UPDATE items SET access_token='REVOKED', is_active=0 WHERE id=?`,
    itemId
  );

const addAccount = async (accountId, itemId, name) =>
  db.run(
    `INSERT OR IGNORE INTO accounts(id, item_id, name) VALUES(?, ?, ?)`,
    accountId,
    itemId,
    name
  );

const saveCursorForItem = async (cursor, itemId) =>
  db.run(`UPDATE items SET transaction_cursor=? WHERE id=?`, cursor, itemId);

const addNewTransaction = async (t) => {
  try {
    return await db.run(
      `INSERT INTO transactions(id, user_id, account_id, category, date, authorized_date, name, amount, currency_code)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.userId,
      t.accountId,
      t.category,
      t.date,
      t.authorizedDate,
      t.name,
      t.amount,
      t.currencyCode
    );
  } catch (err) {
    if (err.code !== "SQLITE_CONSTRAINT") console.error(err);
  }
};

const modifyExistingTransaction = async (t) => {
  try {
    return await db.run(
      `UPDATE transactions SET account_id=?, category=?, date=?, authorized_date=?, name=?, amount=?, currency_code=? WHERE id=?`,
      t.accountId,
      t.category,
      t.date,
      t.authorizedDate,
      t.name,
      t.amount,
      t.currencyCode,
      t.id
    );
  } catch (err) {
    console.error(err);
  }
};

const markTransactionAsRemoved = async (transactionId) => {
  try {
    const updatedId = transactionId + "-REMOVED-" + crypto.randomUUID();
    return await db.run(
      `UPDATE transactions SET id=?, is_removed=1 WHERE id=?`,
      updatedId,
      transactionId
    );
  } catch (err) {
    console.error(err);
  }
};

const getTransactionsForUser = async (userId, maxNum) =>
  db.all(
    `SELECT transactions.*, accounts.name AS account_name, items.bank_name AS bank_name
     FROM transactions
     JOIN accounts ON transactions.account_id = accounts.id
     JOIN items ON accounts.item_id = items.id
     WHERE transactions.user_id=? AND is_removed=0
     ORDER BY date DESC
     LIMIT ?`,
    userId,
    maxNum
  );

module.exports = {
  ready,
  addUser,
  getUserList,
  getUserRecord,
  addItem,
  addBankNameForItem,
  getBankNamesForUser,
  getItemIdsForUser,
  getItemInfo,
  getItemInfoForUser,
  deactivateItem,
  addAccount,
  saveCursorForItem,
  addNewTransaction,
  modifyExistingTransaction,
  markTransactionAsRemoved,
  getTransactionsForUser,
};
