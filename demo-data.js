// Local synthetic data. Inactive demo items are never sent to Plaid.
async function seedDemo(db) {
  await db.exec("BEGIN TRANSACTION");
  try {
    let user = await db.get("SELECT id FROM users WHERE username='test' ORDER BY rowid LIMIT 1");
    if (!user) {
      user = { id: "finview-demo-test" };
      await db.run("INSERT INTO users(id, username) VALUES(?, 'test')", user.id);
    }
    const itemId = "finview-synthetic-bank";
    const existing = await db.get("SELECT id FROM items WHERE id=?", itemId);
    if (!existing) {
      await db.run("INSERT INTO items(id,user_id,access_token,bank_name,is_active) VALUES(?,?,'SYNTHETIC','Demo Bank (synthetic)',0)", itemId, user.id);
      for (const [id, name] of [["demo-checking", "Demo Checking"], ["demo-credit", "Demo Credit Card"]]) {
        await db.run("INSERT INTO accounts(id,item_id,name) VALUES(?,?,?)", id, itemId, name);
      }
      const merchants = [
        ["Whole Foods", "FOOD_AND_DRINK", 78.42],
        ["Coffee shop", "FOOD_AND_DRINK", 6.75],
        ["Metro pass", "TRANSPORTATION", 32],
        ["Target", "GENERAL_MERCHANDISE", 54.29],
        ["Neighborhood restaurant", "FOOD_AND_DRINK", 43.8],
        ["Bookstore", "SHOPPING", 24.95],
      ];
      let serial = 0;
      const insert = async (date, name, category, amount, account = "demo-checking") => {
        await db.run("INSERT INTO transactions(id,user_id,account_id,category,date,authorized_date,name,amount,currency_code) VALUES(?,?,?,?,?,?,?,?,'USD')",
          `synthetic-${serial++}`, user.id, account, category, date, date, name, amount);
      };
      const today = new Date();
      for (let offset = 179; offset >= 0; offset--) {
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
        const date = day.toISOString().slice(0, 10);
        const dom = day.getUTCDate();
        if (dom === 1 || dom === 15) await insert(date, "Payroll deposit", "INCOME", -2850);
        if (dom === 2) await insert(date, "Monthly rent", "RENT_AND_UTILITIES", 1450);
        if (dom === 8) await insert(date, "Electric utility", "RENT_AND_UTILITIES", 85 + offset % 35);
        if (dom === 12) await insert(date, "Streaming subscription", "ENTERTAINMENT", 15.99, "demo-credit");
        if (dom === 20) await insert(date, "Shopping refund", "GENERAL_MERCHANDISE", -39.99, "demo-credit");
        if (offset % 2 === 0) {
          const [name, category, base] = merchants[(offset / 2) % merchants.length];
          await insert(date, name, category, Math.round((base + offset % 17) * 100) / 100, "demo-credit");
        }
      }
    }
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = { seedDemo };
