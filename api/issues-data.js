import { isAuthorizedRequest, isPasswordProtectionEnabled } from '../auth-utils.js';

export const maxDuration = 30;

const FALLBACK_SOURCE_REPO = 'PRIA-Technologies/skunkworks';
const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_API_BASE_URL = 'https://api.github.com';

function resolveSourceRepo() {
  return process.env.ISSUE_SOURCE_REPO || FALLBACK_SOURCE_REPO;
}

function parseRepoSlug(repoSlug) {
  const [owner, repo] = String(repoSlug || '').split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid ISSUE_SOURCE_REPO: ${repoSlug}`);
  }

  return { owner, repo };
}

function normalizeIssue(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: String(issue.state || '').toUpperCase(),
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    labels: (issue.labels || [])
      .map((label) => (typeof label === 'string' ? label : label.name))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
    milestone: issue.milestone ? issue.milestone.title : null,
    url: issue.html_url,
  };
}

async function fetchIssuesPage({ owner, repo, page, token }) {
  const url = new URL(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/issues`);
  url.searchParams.set('state', 'all');
  url.searchParams.set('per_page', '100');
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('direction', 'desc');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': 'github-observeability-tool',
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API ${response.status}: ${message}`);
  }

  return response.json();
}

async function loadIssues({ owner, repo, token }) {
  const issues = [];

  for (let page = 1; page <= 10; page += 1) {
    const pageIssues = await fetchIssuesPage({ owner, repo, page, token });
    const onlyIssues = pageIssues.filter((issue) => !issue.pull_request).map(normalizeIssue);
    issues.push(...onlyIssues);

    if (pageIssues.length < 100) break;
  }

  return issues;
}

async function buildSnapshot() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('Missing GITHUB_TOKEN environment variable.');
  }

  const repoSlug = resolveSourceRepo();
  const { owner, repo } = parseRepoSlug(repoSlug);
  const issues = await loadIssues({ owner, repo, token });
  const milestones = [...new Set(issues.map((issue) => issue.milestone).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));

  return {
    repo: `${owner}/${repo}`,
    source: 'github-api',
    generatedAt: new Date().toISOString(),
    issues,
    milestones,
  };
}

async function handleRequest(request) {
  if (isPasswordProtectionEnabled() && !isAuthorizedRequest(request)) {
    return Response.json(
      { error: 'Authentication required.' },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      },
    );
  }

  try {
    const snapshot = await buildSnapshot();
    return Response.json(snapshot, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      },
    );
  }
}

export async function GET(request) {
  return handleRequest(request);
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
};
