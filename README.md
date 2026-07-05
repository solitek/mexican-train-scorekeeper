# Mexican Train Scorekeeper

A shared, no-login scorekeeping app for Mexican Train dominoes — player roster,
drinking mode, game history, and a family dashboard with charts.

## 1. Create a Supabase project (free)

1. Go to [supabase.com](https://supabase.com) and sign up.
2. Create a new project (pick any name/region, set a database password — you
   won't need it day-to-day).
3. Once it's ready, open **SQL Editor** → **New query**, paste in the contents
   of `supabase-schema.sql` from this folder, and click **Run**. This creates
   the `players` and `games` tables and opens them up for read/write without
   requiring a login — that's what makes the "no login, shared family data"
   setup possible. It also means anyone with your project's URL and anon key
   can read and write this data, which is expected for a family tool but
   worth knowing.
4. Go to **Project Settings → API**. You'll need two values from there:
   - **Project URL**
   - **anon public** key

## 2. Configure the app

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and paste in your Project URL and anon key:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## 3. Run it locally (optional, to test before deploying)

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## 4. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
```

Then create a new repo on github.com (or via `gh repo create`) and push:

```bash
git remote add origin https://github.com/yourusername/mexican-train-scorekeeper.git
git branch -M main
git push -u origin main
```

`.env` is already in `.gitignore`, so your keys won't end up in the repo.

## 5. Deploy (Vercel or Netlify — both free)

**Vercel:**
1. Go to vercel.com → New Project → import your GitHub repo.
2. Framework preset: **Vite** (should auto-detect).
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` with the same values from your `.env`.
4. Deploy. You'll get a URL like `mexican-train-scorekeeper.vercel.app`.

**Netlify** works the same way — import the repo, framework auto-detects as
Vite, add the two environment variables, deploy.

Every time you push to `main`, it auto-redeploys.

## Notes

- The app auto-imports one historic game ("Roz's Birthday / July 4th") the
  first time it loads against a fresh database, so that game isn't lost in
  the move. It only imports once.
- There's no login by design — anyone with the URL can view and edit data.
  Fine for a private family link; just don't post the URL publicly.
