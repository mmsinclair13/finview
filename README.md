# FinView

[Open the live FinView sandbox demo](https://finview-q81m.onrender.com/)

A dark dashboard demo for connecting sandbox bank accounts through Plaid and synchronizing transactions into SQLite. Built with Node.js, Express, plain JavaScript, and Bootstrap.

## Run locally

1. Install Node.js and run `npm ci`.
2. Copy `.env.example` to `.env` and add your Plaid sandbox credentials.
3. Run `npm start` and open http://localhost:8000.
4. Select the default `test` user to explore six months of synthetic transactions, or create your own user to connect a Plaid sandbox bank and sync transactions.

The `test` user is seeded automatically once per database with payroll, rent, utilities, subscriptions, purchases, and refunds. Demo bank records are excluded from Plaid sync and disconnection controls. Existing users and their bank connections are preserved. Dashboard summaries still cover the latest 100 transactions.

The database directory is created automatically. Local credentials, databases, and dependencies are excluded from Git.

## Version control

Use branches for changes and commit meaningful checkpoints. After configuring a GitHub remote, push commits to back up the source and collaborate.

## Deploy on Render

Create a Render Blueprint from this private GitHub repository. The included `render.yaml` configures a Node.js web service and a 1 GB persistent disk for SQLite. This uses a paid Starter service; review the displayed charges before deploying.

Provide `PLAID_CLIENT_ID` and `PLAID_SECRET` using sandbox credentials in Render's environment settings. Never commit these values. Render supplies `PORT`; `DATA_DIR=/var/data` keeps database writes on the persistent disk. The hosted database starts empty, independently of your local data. GitHub updates trigger new deployments.

## Demo limitations

This is a sandbox prototype. The user selector is not secure authentication and Plaid access tokens are stored directly in SQLite. Sync runs on connection or manually; there is no scheduler or webhook handler. Dashboard summaries use the latest 100 loaded transactions.

GitHub stores source code; running this Express app online requires a Node.js hosting service and persistent storage for SQLite. Do not expose this prototype with real bank credentials or financial data.
