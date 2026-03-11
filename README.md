# Github Observeability tool

Shareable GitHub issue observability dashboard with live Vercel refreshes.

Built for PRIA.

It is built to answer a few leadership questions quickly:

- How much work is open versus closed?
- Is total scope growing faster than completion?
- Which milestones and priority bands are carrying the most pressure?
- Where is stale backlog accumulating?
- Which labels and areas are hot?
- How many tickets are closing within 24 hours, 7 days, and 30 days?
- How long does work usually take to close?

## What is in this repo

- `index.html`: standalone dashboard shell
- `issue-graph-app.js`: dashboard logic and charts
- `issue-graph-data.json`: fallback snapshot of GitHub issue data
- `api/issues-data.js`: Vercel function that fetches live GitHub issue data server-side
- `scripts/refresh-data.mjs`: refresh the snapshot from GitHub issues using `gh`
- `vercel.json`: static deploy configuration for Vercel

## Feature direction

The dashboard now includes:

- weekly throughput
- burn-up trend across the last twelve weeks
- open issue aging buckets with stale/high-priority pressure
- closure-speed and median close-time reporting
- milestone, area, and label hotspot views

## Live Vercel deployment

The dashboard is designed to load from `/api/issues-data` on every page load and auto-refresh while the page is open. If live data is unavailable, it falls back to the committed `issue-graph-data.json` snapshot.

Required Vercel environment variables:

- `GITHUB_TOKEN`
- `ISSUE_SOURCE_REPO`

Recommended `GITHUB_TOKEN` shape:

- Fine-grained personal access token
- Repository access to the source repo
- `Issues: Read-only`

Example:

```bash
GITHUB_TOKEN=github_pat_xxx
ISSUE_SOURCE_REPO=PRIA-Technologies/skunkworks
```

## Local snapshot refresh

Prerequisites:

- GitHub CLI installed and authenticated
- access to the repo you want to observe

Refresh the default source repo:

```bash
node ./scripts/refresh-data.mjs
```

Refresh a specific source repo:

```bash
node ./scripts/refresh-data.mjs --repo PRIA-Technologies/skunkworks
```

You can also set:

```bash
ISSUE_SOURCE_REPO=PRIA-Technologies/skunkworks
```

## Deploy on Vercel

This repo is already structured for a Vercel import. Use the repo root as the project root.

- Framework preset: `Other`
- Build command: leave empty
- Output directory: leave empty
- Environment variables:
  - `GITHUB_TOKEN`
  - `ISSUE_SOURCE_REPO`

## Notes

- The Vercel function keeps your GitHub token server-side. The browser never receives the token.
- `issue-graph-data.json` exists as a fallback and for local static previews.
- No local keys or tokens should be committed. `.gitignore` excludes common secret-bearing files and Vercel local state.
