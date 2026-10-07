# FinView

A dark dashboard demo for connecting sandbox bank accounts through Plaid and synchronizing transactions into SQLite. Built with Node.js, Express, plain JavaScript, and Bootstrap.

## Run locally

1. Install Node.js and run `npm ci`.
2. Copy `.env.example` to `.env` and add your Plaid sandbox credentials.
3. Run `npm start` and open http://localhost:8000.
4. Create or select a user, connect a sandbox bank, and sync transactions.

The database directory is created automatically. Local credentials, databases, and dependencies are excluded from Git.

## Version control

Use branches for changes and commit meaningful checkpoints. After configuring a GitHub remote, push commits to back up the source and collaborate.

## Demo limitations

This is a sandbox prototype. The user selector is not secure authentication and Plaid access tokens are stored directly in SQLite. Sync runs on connection or manually; there is no scheduler or webhook handler. Dashboard summaries use the latest 100 loaded transactions.

GitHub stores source code; running this Express app online requires a Node.js hosting service and persistent storage for SQLite. Do not expose this prototype with real bank credentials or financial data.
