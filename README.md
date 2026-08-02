# FormCraft — Employee Form with Real Database

This connects the Employee Details Form to a real SQLite database, so every
submission is saved and viewable later — not just printed.

## What's included

- `server.js` — Node.js backend (built-in SQLite, no npm install needed)
- `public/index.html` — the employee form (fill, submit to database, or print/PDF)
- `public/admin.html` — admin panel to view, inspect, and delete submissions

## Run it

```bash
node server.js
```

- Form: http://localhost:3000
- Admin panel: http://localhost:3000/admin
- Admin login: username `admin`, PIN `1234`

## How it works

1. Someone fills out the form and clicks **"Submit to Database"**.
2. The browser sends the data (including photo and signature as images) to
   `server.js`, which saves it into `formcraft.db` — a real SQLite database file.
3. You (the admin) log into `/admin` to see every submission in a table,
   click "View" for full details (including their photo and signature), or
   "Delete" to remove one.

The **Print / Save as PDF** button still works exactly as before — submitting
to the database and printing are independent, so a form can be saved, printed,
both, or neither.

## Changing the admin PIN

```bash
node -e "console.log(require('crypto').scryptSync('YOUR_NEW_PIN','formcraft-salt-v1',32).toString('hex'))"
```
Paste the output into `PIN_SALT`'s matching hash check area — specifically,
replace what `hashPin("1234")` seeds on first run, or manually update the
`admins` table in `formcraft.db` using any SQLite browser tool.

## Deploying it live

GitHub Pages can't run this — it's server-side. Use a Node-friendly host:
- **Render.com** (free tier) — connect your repo, start command: `node server.js`
- **Railway.app** — similar

Note: on most free hosts, the SQLite file resets on redeploy unless you attach
persistent storage. Fine for testing/demo; for serious use, consider a hosted
database (e.g., Postgres) once volume grows.
