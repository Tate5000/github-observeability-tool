#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLBACK_SOURCE_REPO = 'PRIA-Technologies/skunkworks';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_DATA_FILE = path.join(PROJECT_ROOT, 'issue-graph-data.json');
const SOURCE_REPO_FLAG = '--repo';

function execText(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 8,
    ...options,
  }).trim();
}

function resolveSourceRepo() {
  const flagIndex = process.argv.indexOf(SOURCE_REPO_FLAG);
  if (flagIndex >= 0 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1];
  }

  return process.env.ISSUE_SOURCE_REPO || FALLBACK_SOURCE_REPO;
}

function loadIssues(repo) {
  const raw = execText('gh', [
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--limit',
    '200',
    '--json',
    'number,title,state,createdAt,updatedAt,closedAt,labels,milestone,url',
  ]);

  return JSON.parse(raw).map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    closedAt: issue.closedAt,
    labels: issue.labels.map((label) => label.name).sort((a, b) => a.localeCompare(b)),
    milestone: issue.milestone ? issue.milestone.title : null,
    url: issue.url,
  }));
}

function main() {
  const repo = resolveSourceRepo();
  const issues = loadIssues(repo);
  const milestones = [...new Set(issues.map((issue) => issue.milestone).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));

  const snapshot = {
    repo,
    generatedAt: new Date().toISOString(),
    issues,
    milestones,
  };

  fs.writeFileSync(OUTPUT_DATA_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(OUTPUT_DATA_FILE);
}

main();
