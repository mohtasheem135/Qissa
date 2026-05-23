# Qissa — Setup Guidance Document

> Everything you need to set up **before** Claude Code starts building. Follow this end-to-end. Treat it as a checklist.

**Version:** 1.0
**Target audience:** You (the developer/owner)

---

## Overview — What You're Setting Up

Before any code is written, you need accounts and keys for the following external services:

| # | Service | Purpose | Free Tier | Required for Phase 1 |
|---|---|---|---|---|
| 1 | **GitHub** | Source code + Vercel deploy hook | Free | ✓ Mandatory |
| 2 | **Vercel** | Hosting | Generous free | ✓ Mandatory |
| 3 | **Supabase** | Database + Auth + Storage backup | Free (500MB DB, 1GB storage) | ✓ Mandatory |
| 4 | **ImageKit** | Image CDN + storage for covers | Free (20GB storage, 20GB bandwidth/month) | ✓ Mandatory |
| 5 | **Google AI Studio (Gemini)** | Primary AI provider | Free (15 RPM, 1500 RPD) | ✓ Mandatory |
| 6 | **Groq** | Optional secondary AI provider | Free (generous) | Optional |
| 7 | **OpenRouter** | Optional multi-model router | Has free models | Optional |
| 8 | **A domain name** (optional Phase 1) | Custom URL | $10–15/year | Optional |

Total time to complete this guidance document: **~90 minutes** if done in one sitting.

---

## Section 1 — GitHub Setup

You already likely have a GitHub account. If not:

1. Sign up at https://github.com/signup
2. Verify your email
3. Create a new **private** repository named `qissa`
   - Don't initialize with README — Claude Code will set up the project locally
   - Keep it private until you're comfortable
4. (Optional but recommended) Set up SSH keys for clean git push/pull:
   https://docs.github.com/en/authentication/connecting-to-github-with-ssh

**What you give Claude Code:** the repo URL (e.g., `git@github.com:yourusername/qissa.git`)

---

## Section 2 — Supabase Setup (Database, Auth, Storage)

### 2.1 Create Account & Project

1. Go to https://supabase.com and sign up (use GitHub login for ease)
2. Create a new organization (free tier is fine)
3. Click **"New Project"**
   - Name: `qissa`
   - Database Password: **Generate a strong one and save it** (you won't see it again easily). Use a password manager.
   - Region: pick the one closest to your users
     - For India audience: `Mumbai (ap-south-1)` or `Singapore (ap-southeast-1)`
     - For global: `Singapore` is a good default
   - Pricing plan: **Free**
4. Wait ~2 minutes for the project to provision

### 2.2 Collect Your Supabase Keys

Once provisioned, go to **Project Settings → API** in the Supabase dashboard. You need three values:

| Key | Description | Where to use |
|---|---|---|
| `Project URL` | e.g., `https://abcdefgh.supabase.co` | Public — used in browser and server |
| `anon public` key | Public API key, safe in browser | Public — used in browser |
| `service_role` key | **Server-only**, full DB access | **Secret** — server-side only, never expose |

**Save these securely.** You'll paste them into `.env.local` later.

### 2.3 Configure Authentication

In Supabase dashboard:

1. Go to **Authentication → Providers**
2. **Email** provider: enabled by default — leave it on
3. **Disable email confirmations** for now (you'll be the only user):
   - **Authentication → Sign In/Up → Email**
   - Toggle "Confirm email" → **OFF**
4. **Disable sign-ups for the public:**
   - **Authentication → Sign In/Up**
   - Toggle "Allow new users to sign up" → **OFF**
   - This is critical — there's no admin signup form; you create yourself manually.

### 2.4 Create the Admin User (You)

1. Go to **Authentication → Users**
2. Click **"Add user"** → **"Create new user"**
3. Email: your admin email (e.g., `youremail@gmail.com`)
4. Password: a strong password (save in password manager)
5. **Auto Confirm User:** check this box
6. Click "Create user"

**This email** is the one you'll set as `ADMIN_EMAIL` later. The login route checks: *"is this person logged in AND is their email exactly this?"*

### 2.5 Enable Storage (Backup Image Storage)

Even though you're using ImageKit primarily, Supabase Storage is useful as a fallback (e.g., for things like prompt files, exports).

1. Go to **Storage**
2. Click **"Create a new bucket"**
3. Name: `qissa-assets`
4. **Public bucket:** OFF (for now; we'll set RLS policies later)
5. Click Create

Claude Code will write SQL migrations for tables and Row Level Security policies. You don't need to create tables manually — just have the project ready.

### 2.6 Save These Values

Open a note (or password manager entry) titled **"Qissa Supabase Credentials"** and save:

```
SUPABASE_PROJECT_REF=abcdefgh
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...    (paste the full key)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...    (paste — KEEP SECRET)
SUPABASE_DB_PASSWORD=...    (the password you generated)
ADMIN_EMAIL=youremail@gmail.com
ADMIN_PASSWORD=...    (the password you set for the user)
```

---

## Section 3 — ImageKit Setup (Image CDN & Storage)

ImageKit is significantly more generous than Supabase Storage on the free tier — 20GB storage and 20GB bandwidth/month. Perfect for cover images.

### 3.1 Create Account

1. Go to https://imagekit.io
2. Sign up (you can use Google login)
3. You'll be asked for a workspace/account name
   - Workspace name: `qissa` (or anything you like)
   - This determines your default ImageKit URL: `https://ik.imagekit.io/<your-id>/`
4. Verify email if asked

### 3.2 Get Your ImageKit Credentials

After signup, you're on the dashboard. Go to **Developer Options → API Keys** (or **Settings → Developer Options**). You need three values:

| Key | Description |
|---|---|
| `URL Endpoint` | e.g., `https://ik.imagekit.io/yourid/` — used everywhere |
| `Public Key` | Safe in browser |
| `Private Key` | **Server-only**, used for uploads |

### 3.3 Create a Media Folder Structure

In ImageKit's **Media Library**, create this folder structure:

```
/qissa
  /covers           ← story cover images
  /uploads          ← user-uploaded misc (Phase 2)
  /og               ← OpenGraph share images (auto-generated, Phase 1.5)
```

You don't need to upload anything here yet — Claude Code will handle uploads programmatically when the admin uploads a cover.

### 3.4 Configure Upload Settings

In **Settings → Media Library → Upload**:
- Default folder: `/qissa/covers` (for safety)
- File size limit: free tier allows up to 25MB per file (Phase 1 we'll cap at 2MB in our UI)

### 3.5 (Optional) Configure Image Optimization

In **Settings → Image Optimization**:
- Auto WebP / AVIF: **ON** (default)
- Auto quality: **ON**
- This gives huge bandwidth savings — keep defaults.

### 3.6 Save These Values

Append to your credentials note:

```
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/yourid/
IMAGEKIT_PUBLIC_KEY=public_...
IMAGEKIT_PRIVATE_KEY=private_...    (KEEP SECRET)
```

---

## Section 4 — Google AI Studio (Gemini API Key)

Your primary translation provider.

### 4.1 Create the Key

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with a Google account (preferably the same one you use for other dev work — easier project management)
3. Click **"Create API key"**
4. Either create in a new project or select an existing Google Cloud project
   - If asked, the default project is fine
5. Copy the key immediately — it looks like `AIzaSy...`

### 4.2 Verify the Key Works

(Optional but useful) Open a terminal and run:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_KEY_HERE" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"Translate to Hindi: Hello, how are you?"}]}]}'
```

You should see a JSON response with Hindi text in it. If you see an error, the key isn't ready yet — wait a minute and retry.

### 4.3 Free Tier Limits (Important to Know)

- **Gemini 2.0 Flash:** 15 requests per minute, 1500 requests per day, 1M tokens per minute
- This is plenty for personal admin use. If you hit rate limits, the app's exponential backoff handles it.
- If you upgrade to paid later: add a billing account in Google Cloud Console.

### 4.4 Save This Value

```
GEMINI_API_KEY=AIzaSy...    (KEEP SECRET)
```

---

## Section 5 — Groq API Key (Optional Secondary Provider)

Groq runs open-source models at very high speed and has a generous free tier — great fallback when Gemini is rate-limited.

### 5.1 Create the Key

1. Go to https://console.groq.com/keys
2. Sign up (Google login works)
3. Click **"Create API Key"**
4. Name it `qissa`
5. Copy the key (looks like `gsk_...`) — **you cannot see it again after closing the modal**

### 5.2 Save This Value

```
GROQ_API_KEY=gsk_...    (KEEP SECRET)
```

---

## Section 6 — OpenRouter API Key (Optional Multi-Model Router)

OpenRouter gives you access to dozens of models (including some free ones) through one API. Useful for experimentation.

### 6.1 Create the Key

1. Go to https://openrouter.ai/
2. Sign up
3. Go to **Keys** in the dashboard → **Create Key**
4. Name it `qissa`
5. Set a credit limit if you want (Phase 1 you can leave at $0 and use only free models)
6. Copy the key (looks like `sk-or-v1-...`)

### 6.2 Save This Value

```
OPENROUTER_API_KEY=sk-or-v1-...    (KEEP SECRET)
```

---

## Section 7 — Vercel Setup (Hosting)

You'll deploy via Vercel after the first commit. You can do this now or after a few days of local development.

### 7.1 Create Account

1. Go to https://vercel.com/signup
2. Sign up with **GitHub** (this is important — it lets Vercel auto-deploy from your repo)
3. Authorize Vercel to access your GitHub

### 7.2 Defer Project Creation

Don't create the project yet — wait until you have actual code pushed. Section "Deployment" in `implementation-plan.md` covers this.

You don't need any keys from Vercel — it auto-detects Next.js projects.

---

## Section 8 — Local Development Environment

This is what should be ready on your machine before Claude Code starts.

### 8.1 Required Software

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 20 LTS or 22 LTS | https://nodejs.org/en/download |
| **npm** | Comes with Node.js | (bundled) |
| **Git** | Latest | https://git-scm.com/downloads |
| **VS Code** (or Cursor) | Latest | https://code.visualstudio.com |
| **Claude Code** | Latest | https://docs.claude.com/en/docs/claude-code |

Verify in your terminal:

```bash
node --version    # should print v20.x.x or v22.x.x
npm --version     # should print 10.x.x or higher
git --version     # should print git version 2.x
claude --version  # should print Claude Code version
```

### 8.2 Recommended VS Code Extensions

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Supabase
- GitLens

### 8.3 Folder for the Project

Decide where the project will live. Recommended:

```
~/projects/qissa
```

Create the folder but **don't initialize anything** — Claude Code does that.

```bash
mkdir -p ~/projects/qissa
cd ~/projects/qissa
```

---

## Section 9 — The Master Credentials Note

Before handing off to Claude Code, you should have one note (in your password manager) titled **"Qissa Credentials"** with all of this:

```
# ─── Supabase ───
SUPABASE_PROJECT_REF=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
ADMIN_EMAIL=
ADMIN_PASSWORD=

# ─── ImageKit ───
IMAGEKIT_URL_ENDPOINT=
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_PRIVATE_KEY=

# ─── AI Providers ───
GEMINI_API_KEY=
GROQ_API_KEY=                  # optional
OPENROUTER_API_KEY=            # optional
OPENAI_API_KEY=                # optional, paid
ANTHROPIC_API_KEY=             # optional, paid

# ─── App ───
NEXT_PUBLIC_APP_URL=http://localhost:3000   # change to your domain in production
```

When Claude Code asks for any of these, paste them from this note.

---

## Section 10 — Two Files Claude Code Will Need

Claude Code will create these for you, but you should know what they are:

### `.env.local` (NEVER commit this — it goes in `.gitignore`)

Contains all the secrets above. Used during local development.

### `.env.example` (committed)

A template version with empty values. Helps anyone (including future you) know what env vars are needed.

---

## Section 11 — Decisions You Need to Make Before Building

Quick questions Claude Code will ask you. Decide ahead of time:

1. **App display name:** "Qissa" — or do you want it shown differently? (e.g., "Qissa — Stories Translated")
2. **Theme color:** Default is `#4F46E5` (indigo). Want different? Pick a hex color.
3. **Default language for the admin UI:** English (recommended)
4. **Initial categories to seed:** I recommend:
   - Stories → Motivational, Islamic, Real Life, Autobiography, Children, Folktales, Mystery
   - Articles → Opinion, Technology, Health
   - Poetry → Ghazal, Nazm, Sher
   - (You can edit/add later)
5. **Initial admin email & password** (already created in §2.4)

---

## Section 12 — Time & Cost Summary

### Time investment
| Activity | Time |
|---|---|
| All account signups (§1–§7) | ~60 min |
| Local dev setup (§8) | ~30 min |
| **Total** | **~90 min** |

### Recurring costs (Phase 1)
| Item | Cost |
|---|---|
| Supabase free tier | ₹0 / $0 |
| Vercel free tier | ₹0 / $0 |
| ImageKit free tier | ₹0 / $0 |
| Gemini free tier | ₹0 / $0 |
| Groq free tier | ₹0 / $0 |
| Domain (optional) | ~₹1000/year (~$12/year) |
| **Total Phase 1** | **₹0–₹1000/year** |

You can run Qissa entirely for free indefinitely as long as you stay within free tiers, which is realistic for personal/small-audience use.

---

## Section 13 — Checklist Before Starting Implementation

Tick each off before kicking off Claude Code:

- [ ] GitHub account ready, `qissa` repo created (private)
- [ ] Supabase project created, region selected, admin user added
- [ ] Supabase keys saved to credentials note
- [ ] Supabase Storage bucket `qissa-assets` created
- [ ] Email signup disabled, email confirmation disabled
- [ ] ImageKit account created, folders created, keys saved
- [ ] Gemini API key created and tested
- [ ] (Optional) Groq API key created
- [ ] (Optional) OpenRouter API key created
- [ ] Vercel account created (project not yet)
- [ ] Node.js 20+ installed locally
- [ ] Git installed locally
- [ ] Claude Code installed
- [ ] `~/projects/qissa` folder created (empty)
- [ ] All credentials in one secure note
- [ ] Decisions in §11 made

When all boxes are ticked → open `~/projects/qissa` in your terminal, launch Claude Code, and feed it the `implementation-plan.md` file.

---

**End of guidance document.**
