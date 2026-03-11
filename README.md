# Github Observeability tool

Shareable static dashboard for GitHub issue observability.

It is built to answer a few leadership questions quickly:

- How much work is open versus closed?
- Which milestones and priority bands are carrying the most pressure?
- Which labels and areas are hot?
- How many tickets are closing within 24 hours, 7 days, and 30 days?

## What is in this repo

- `index.html`: standalone dashboard shell
- `issue-graph-app.js`: dashboard logic and charts
- `issue-graph-data.json`: current snapshot of GitHub issue data
- `scripts/refresh-data.mjs`: refresh the snapshot from GitHub issues using `gh`
- `vercel.json`: static deploy configuration for Vercel

## Refresh the data

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

This repo is already structured as a static site. Import it into Vercel and use the repo root as the project root.

- Framework preset: `Other`
- Build command: leave empty
- Output directory: leave empty

## Notes

- This repo contains a snapshot, not live browser-side GitHub API calls.
- No local keys or tokens should be committed. `.gitignore` excludes common secret-bearing files and Vercel local state.
