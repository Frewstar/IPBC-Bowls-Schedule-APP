# IPBC Bowls Manager — Setup Guide
**A Frewstar Product**

---

## What you need installed first
- **Node.js** — download from https://nodejs.org (choose the LTS version)
- That's it.

---

## First-time setup (do this once)

Open a terminal / command prompt in this folder, then run:

```
npm install
npm install sharp
node generate-icons.mjs
```

This installs everything and creates the app icons.

---

## Run it locally (for testing)

```
npm run dev
```

Then open http://localhost:5173 in your browser.

---

## Build for the web

```
npm run build
```

This creates a `dist/` folder — that's your finished app.

---

## Put it online (free, takes 2 minutes)

### Option A — Netlify (recommended, easiest)
1. Go to https://netlify.com and sign up free
2. Run `npm run build`
3. Drag the `dist/` folder onto the Netlify dashboard
4. You get a live URL instantly (e.g. `ipbc-bowls.netlify.app`)
5. You can set a custom domain if you have one

### Option B — Vercel
1. Go to https://vercel.com and sign up free
2. Install Vercel CLI: `npm install -g vercel`
3. Run `vercel` in this folder and follow the prompts

---

## Install on phones (once it's online)

### iPhone / iPad
1. Open the URL in Safari
2. Tap the **Share** button (square with arrow)
3. Tap **"Add to Home Screen"**
4. Tap **Add** — it appears as an app icon

### Android
1. Open the URL in Chrome
2. Tap the **three dots** menu
3. Tap **"Add to Home screen"** or **"Install app"**
4. Tap **Install**

---

## Sharing with club members
Just send them the URL — they can install it themselves from their phone browser.
No app store needed.

---

*Built by Frewstar*
