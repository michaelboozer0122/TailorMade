# Deploy the TailorMade server

This puts the server on [Render](https://render.com) so the app works anywhere, without your computer. It takes about 10 minutes, all in the browser.

**Cost:** about **$7/month** for Render's Starter instance, plus about $0.25/month for the 1 GB disk that holds accounts and usage counts. Render's free tier has no persistent disk, so everyone's accounts would be wiped on each deploy. Claude API usage is billed separately by Anthropic, roughly a few cents per tailored resume.

## 1. Get an Anthropic API key

1. Go to https://console.anthropic.com → **API Keys** → **Create key**. Copy it (it starts with `sk-ant-`).
2. Under **Billing**, add credit and set a **monthly spend limit**, so a bug or abuse can't run up a big bill.

## 2. Pick a test access code

Make up a long secret phrase (12+ characters), e.g. `purple-lantern-river-42`. The test APK's *Test sign-in* needs it. Anyone with the code can make test accounts, so share it only with people you want testing.

## 3. Create the server on Render

1. Sign up at https://render.com (signing in with GitHub is easiest).
2. Click **New** → **Blueprint**, connect your GitHub account, and pick the **TailorMade** repository.
3. **Branch:** choose `claude/gracious-heisenberg-5pctbx`, or `main` if you've merged the work there.
4. Render reads `render.yaml` and shows a service called **tailormade-api**. Fill in:
   - `ANTHROPIC_API_KEY`: your key from step 1
   - `TEST_ACCESS_CODE`: your code from step 2
   - Leave `GOOGLE_CLIENT_IDS`, `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_AUTH` empty for now
5. Click **Apply**. Render builds and starts the server, which takes 3–5 minutes the first time. `SESSION_SECRET` is generated for you.
6. When it says **Live**, copy the URL at the top of the service page, e.g. `https://tailormade-api.onrender.com`. If that name was taken, Render adds a few letters to the end.
7. Check it works: open `<your URL>/health` in a browser. You should see `{"ok":true}`.

## 4. Point the app at it

In **TailorMade Test** on your phone, on the sign-in screen:

1. **Server address:** your Render URL (with `https://`, no slash at the end).
2. **Test sign-in:** any email, plus your access code.

If you're already signed in to a local server, go to **Account → Sign out** first.

## Day-to-day

- **Updates:** each push to the branch you picked redeploys automatically (`autoDeploy` in `render.yaml`).
- **Logs:** Render dashboard → tailormade-api → **Logs**.
- **Change limits:** Render → tailormade-api → **Environment**, edit `FREE_TAILORS_PER_MONTH` etc. Render restarts the server with the new values.
- **Give someone Pro by hand:** Render → tailormade-api → **Shell**, then run `node dist/admin.js their@email.com pro` (`free` to undo).
- **Backups:** Render takes daily snapshots of the disk. Restore under **Disks** if needed.

## Before going to the app stores

- Set `TEST_ACCESS_CODE` to empty to turn off test sign-in, once Apple/Google sign-in are set up (README → *Set up Sign in with Apple and Google*). Add your Google client IDs to `GOOGLE_CLIENT_IDS`.
- Put the Render URL in `app/eas.json` → `production.env.EXPO_PUBLIC_API_URL`. Store builds have no server-address box.
- For subscriptions, fill in the RevenueCat variables (README → *Subscriptions*). The webhook URL is `<your URL>/api/billing/revenuecat-webhook`.
- Optional: add a custom domain (e.g. `api.yourdomain.com`) under **Settings → Custom Domains**.

## Other hosts

`server/Dockerfile` runs on any host that builds Docker images and can mount a persistent disk at `/data`, such as Railway, Fly.io or DigitalOcean App Platform. Set the same environment variables as in `render.yaml`. Run a single instance, because the database is one SQLite file on that disk.
