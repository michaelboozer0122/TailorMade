# TailorMade

TailorMade is an iOS and Android app that rewrites your resume for a specific job.

1. **Upload your general resume (PDF) once.** It's turned into structured data and stored only on your phone.
2. **Pick a job.** Paste a job-listing link, paste the description, or just type a job title.
3. **Get a tailored resume.** You also get a match score, the keywords you already match, the gaps, a list of what changed, and a cover letter. You can export the resume and the cover letter as PDFs, or share them.

The AI is told never to invent employers, titles, dates, degrees or numbers. It can only reword, reorder and emphasize what's already on your resume. Requirements you don't meet are shown as "gaps" and never added to the resume.

```
app/      Expo (React Native) app that builds for iOS + Android from one codebase
server/   Small Node/TypeScript API that holds the Claude API key, reads job links, and calls Claude
```

## Why there's a server

Your Anthropic API key **must not** be put inside the app. Anyone can pull it out of an app bundle. The app talks to `server/`, which keeps the key and makes the AI calls. The server keeps nothing: no database, and resumes aren't saved.

## Run it locally

**Server**

```bash
cd server
cp .env.example .env        # put your ANTHROPIC_API_KEY in it
npm install
npm run dev                 # http://localhost:8787
```

**App**

```bash
cd app
cp .env.example .env.local  # set EXPO_PUBLIC_API_URL to http://<your-computer-LAN-IP>:8787
npm install
npx expo start              # scan the QR code with Expo Go on your phone
```

Checks: `npm run typecheck` in both folders.

## Deploy the server

`server/Dockerfile` works on any container host, such as Render, Railway, Fly.io, Google Cloud Run or AWS App Runner. Set `ANTHROPIC_API_KEY` there, and optionally `APP_TOKEN` and `RATE_LIMIT_PER_HOUR`. The host must provide HTTPS, because both stores require it in practice. Then put the server's URL in `app/eas.json` under `EXPO_PUBLIC_API_URL`.

> The built-in rate limit is per IP address and kept in memory. `APP_TOKEN` stops casual abuse but can be pulled out of the app. If you expect real traffic, add user accounts (e.g. Sign in with Apple/Google via Firebase Auth or Supabase), enforce per-user quotas, and charge for usage (e.g. RevenueCat subscriptions), because each tailoring run costs API money.

## Publish to the App Store and Google Play

The app builds in the cloud with [EAS](https://docs.expo.dev/eas/), so you don't need Xcode or Android Studio.

**Accounts you need**

- Apple Developer Program ($99/yr): https://developer.apple.com/programs/
- Google Play Console ($25 one-time): https://play.google.com/console
- Expo account (free): https://expo.dev/signup

**One-time setup**

1. In `app/app.json`, change `ios.bundleIdentifier` and `android.package` from `com.tailormade.app` to an ID you own, e.g. `com.yourname.tailormade`. These can't be changed after you publish.
2. Replace the placeholder images in `app/assets/`. You need a 1024×1024 icon, the Android adaptive-icon layers and a splash image.
3. Set your deployed server URL in `app/eas.json` → `build.production.env.EXPO_PUBLIC_API_URL`.
4. Host `PRIVACY.md` at a public URL (GitHub Pages or a Notion page is fine). Both stores ask for this link.

**Build and submit**

```bash
cd app
npx eas-cli@latest login
npx eas-cli@latest init                                   # links the project to your Expo account
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios --latest         # uploads to App Store Connect / TestFlight
npx eas-cli@latest submit --platform android --latest     # uploads to Play Console (internal track)
```

EAS creates and manages the signing certificates and keystores for you. For the first Android upload, Google requires you to upload the `.aab` by hand in Play Console once. After that, `eas submit` works.

**Store listing checklist**

- *App Store Connect → App Privacy.* Declare "User Content (resume / other user content)" used for **App Functionality**, not linked to identity, not used for tracking. Data is sent to your server and to Anthropic to generate results and isn't stored.
- *Google Play → Data safety.* Mark that it collects "Files and docs" and "Personal info (name, email, phone, address)". Say the data is processed ephemerally, encrypted in transit, not shared for advertising, and can be deleted in the app (Resume → "Delete all my data").
- *Apple review notes.* Give reviewers a sample resume PDF and a public job link so they can test the full flow. Apple rejects apps whose main feature they can't try.
- *AI disclosure.* The app shows "AI can make mistakes" on every result. Keep this, and mention AI generation in the store description.
- *Testing first.* Use TestFlight (iOS) and the Internal testing track (Android) before going to production. Google requires new personal developer accounts to run a closed test with 12 testers for 14 days before going public.

## How it works

| Step | Endpoint | What happens |
|---|---|---|
| Upload resume | `POST /api/resume/parse` (multipart `resume`) | The PDF is sent to Claude as a document and comes back as structured JSON (`server/src/schema.ts`). |
| Tailor | `POST /api/tailor` `{profile, jobUrl? \| jobText? \| jobTitle?}` | The server fetches the job page: it reads schema.org `JobPosting` data when present, otherwise strips the HTML, and blocks private network addresses. Claude then returns the tailored resume, fit analysis and cover letter as validated JSON. |

Model: `claude-opus-5-5` with structured outputs and server-side refusal fallback (`server/src/claude.ts`).
