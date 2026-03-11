const Chart = globalThis.Chart;

if (!Chart) {
  throw new Error('Chart.js failed to load.');
}

const STATE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

const FAMILY_OPTIONS = [
  { value: 'all', label: 'All families' },
  { value: 'type', label: 'Type' },
  { value: 'priority', label: 'Priority' },
  { value: 'area', label: 'Area' },
  { value: 'meta', label: 'Support' },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  { value: 'high', label: 'P0 / P1 only' },
  { value: 'priority:P0', label: 'P0 only' },
  { value: 'priority:P1', label: 'P1 only' },
  { value: 'priority:P2', label: 'P2 only' },
  { value: 'priority:P3', label: 'P3 only' },
  { value: 'Unscoped', label: 'Unscoped only' },
];

const PRIORITY_ORDER = ['priority:P0', 'priority:P1', 'priority:P2', 'priority:P3', 'Unscoped'];
const PRIORITY_LABELS = {
  'priority:P0': 'P0',
  'priority:P1': 'P1',
  'priority:P2': 'P2',
  'priority:P3': 'P3',
  Unscoped: 'Unscoped',
};

const FAMILY_LABELS = {
  type: 'Type',
  priority: 'Priority',
  area: 'Area',
  meta: 'Support',
};

const TYPE_ORDER = ['bug', 'enhancement', 'documentation', 'question', 'support'];
const TYPE_LABELS = {
  bug: 'Bug',
  enhancement: 'Enhancement',
  documentation: 'Docs',
  question: 'Question',
  support: 'Support',
};

const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = HOUR_MS * 24;
const LIVE_REFRESH_INTERVAL_MS = 1000 * 60 * 5;
const LIVE_DATA_URL = '/api/issues-data';
const SNAPSHOT_DATA_URL = './issue-graph-data.json';
const FLOW_LOOKBACK_WEEKS = 12;
const CLOSURE_SPEED_BUCKETS = [
  { label: '24 hours', limitMs: DAY_MS, color: '#15b8a6' },
  { label: '7 days', limitMs: DAY_MS * 7, color: '#3b82f6' },
  { label: '30 days', limitMs: DAY_MS * 30, color: '#f59f0a' },
];
const AGING_BUCKETS = [
  { label: '0-7d', minDays: 0, maxDays: 7 },
  { label: '8-30d', minDays: 7, maxDays: 30 },
  { label: '31-90d', minDays: 30, maxDays: 90 },
  { label: '90d+', minDays: 90, maxDays: Number.POSITIVE_INFINITY },
];

const COLORS = {
  open: '#123459',
  closed: '#22c55e',
  bug: '#e85d5d',
  enhancement: '#15b8a6',
  documentation: '#3b82f6',
  question: '#f59f0a',
  support: '#9b5de5',
  priority: '#f97316',
  area: '#3b82f6',
  grid: 'rgba(100, 116, 139, 0.15)',
  ink: '#1f2937',
  muted: '#64748b',
};

const charts = {};
const state = {
  stateFilter: 'all',
  milestone: 'all',
  family: 'all',
  priority: 'all',
};

const elements = {
  repoMeta: document.getElementById('repo-meta'),
  generatedMeta: document.getElementById('generated-meta'),
  scopeMeta: document.getElementById('scope-meta'),
  refreshButton: document.getElementById('refresh-button'),
  statePills: document.getElementById('state-pills'),
  milestoneSelect: document.getElementById('milestone-select'),
  familySelect: document.getElementById('family-select'),
  prioritySelect: document.getElementById('priority-select'),
  metrics: document.getElementById('metrics'),
  milestoneMeta: document.getElementById('milestone-meta'),
  agingMeta: document.getElementById('aging-meta'),
  familyPressure: document.getElementById('family-pressure'),
  hotspots: document.getElementById('hotspots'),
  riskList: document.getElementById('risk-list'),
  milestoneHealth: document.getElementById('milestone-health'),
};

let snapshot = null;
let autoRefreshHandle = null;

Chart.defaults.color = COLORS.muted;
Chart.defaults.borderColor = COLORS.grid;
Chart.defaults.font.family = '"Avenir Next", "Segoe UI", sans-serif';
Chart.defaults.animation = false;

function familyOf(label) {
  if (label.startsWith('priority:')) return 'priority';
  if (label.startsWith('area:')) return 'area';
  if (label === 'bug' || label === 'enhancement' || label === 'documentation' || label === 'question') return 'type';
  return 'meta';
}

function priorityOf(issue) {
  return issue.labels.find((label) => label.startsWith('priority:')) || 'Unscoped';
}

function typeOf(issue) {
  if (issue.labels.includes('bug')) return 'bug';
  if (issue.labels.includes('enhancement')) return 'enhancement';
  if (issue.labels.includes('documentation')) return 'documentation';
  if (issue.labels.includes('question')) return 'question';
  return 'support';
}

function areaLabels(issue) {
  return issue.labels.filter((label) => label.startsWith('area:'));
}

function formatPct(value) {
  return Math.round(value * 100) + '%';
}

function formatDate(dateString) {
  if (!dateString) return 'n/a';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateString));
}

function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return 'n/a';
  if (ms < DAY_MS * 2) return `${Math.max(1, Math.round(ms / HOUR_MS))}h`;
  if (ms < DAY_MS * 21) return `${(ms / DAY_MS).toFixed(ms < DAY_MS * 7 ? 1 : 0)}d`;
  const weeks = ms / (DAY_MS * 7);
  if (weeks < 12) return `${weeks.toFixed(1)}w`;
  return `${Math.round(ms / DAY_MS)}d`;
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  const weight = position - lowerIndex;
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function issueAgeMs(issue, referenceMs) {
  const createdAt = new Date(issue.createdAt || issue.updatedAt || referenceMs).getTime();
  if (Number.isNaN(createdAt)) return null;
  return Math.max(0, referenceMs - createdAt);
}

function weekStart(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function weekKey(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function shortWeekLabel(key) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(key + 'T00:00:00Z'));
}

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderStatePills() {
  elements.statePills.innerHTML = STATE_OPTIONS.map(
    (option) => `<button class="pill ${state.stateFilter === option.value ? 'active' : ''}" data-state="${esc(option.value)}" type="button">${esc(option.label)}</button>`,
  ).join('');

  elements.statePills.querySelectorAll('[data-state]').forEach((button) => {
    button.addEventListener('click', () => {
      state.stateFilter = button.getAttribute('data-state');
      render();
    });
  });
}

function renderSelectOptions(selectElement, options, selectedValue) {
  selectElement.innerHTML = options
    .map((option) => `<option value="${esc(option.value)}"${option.value === selectedValue ? ' selected' : ''}>${esc(option.label)}</option>`)
    .join('');
}

function issueMatchesFilters(issue) {
  if (state.stateFilter === 'open' && issue.state !== 'OPEN') return false;
  if (state.stateFilter === 'closed' && issue.state !== 'CLOSED') return false;
  if (state.milestone !== 'all' && (issue.milestone || 'No milestone') !== state.milestone) return false;

  if (state.family !== 'all' && !issue.labels.some((label) => familyOf(label) === state.family)) {
    return false;
  }

  const priority = priorityOf(issue);
  if (state.priority === 'high' && !['priority:P0', 'priority:P1'].includes(priority)) return false;
  if (state.priority !== 'all' && state.priority !== 'high' && priority !== state.priority) return false;

  return true;
}

function createEmptyChartData(label = 'No data') {
  return {
    labels: [label],
    values: [0],
  };
}

function closureDurationMs(issue) {
  if (!issue.createdAt || !issue.closedAt) return null;
  const openedAt = new Date(issue.createdAt).getTime();
  const closedAt = new Date(issue.closedAt).getTime();
  if (Number.isNaN(openedAt) || Number.isNaN(closedAt) || closedAt < openedAt) return null;
  return closedAt - openedAt;
}

function syncSnapshotMeta(source) {
  const repoLabel = snapshot.repo || 'Unknown repo';
  const generatedLabel = snapshot.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleString()
    : 'unknown time';

  elements.repoMeta.textContent = source === 'live'
    ? `${repoLabel} · Live GitHub`
    : `${repoLabel} · Snapshot fallback`;
  elements.generatedMeta.textContent = source === 'live'
    ? `Live as of ${generatedLabel}`
    : `Snapshot as of ${generatedLabel}`;
}

function buildView() {
  const issues = snapshot.issues.filter(issueMatchesFilters);
  const openIssues = issues.filter((issue) => issue.state === 'OPEN');
  const closedIssues = issues.filter((issue) => issue.state === 'CLOSED');
  const nowMs = Date.now();

  const labelStats = new Map();
  const areaStats = new Map();
  const milestoneStats = new Map();
  const priorityStats = new Map(PRIORITY_ORDER.map((priority) => [priority, { open: 0, closed: 0 }]));
  const typeStats = new Map(TYPE_ORDER.map((type) => [type, 0]));
  const familyStats = new Map(
    Object.keys(FAMILY_LABELS).map((family) => [
      family,
      {
        issueIds: new Set(),
        openIds: new Set(),
        closedIds: new Set(),
        topLabel: null,
        topCount: 0,
      },
    ]),
  );

  for (const issue of issues) {
    const priority = priorityOf(issue);
    const type = typeOf(issue);
    const milestone = issue.milestone || 'No milestone';
    const uniqueLabels = [...new Set(issue.labels)];
    const bucket = priorityStats.get(priority);
    bucket[issue.state === 'OPEN' ? 'open' : 'closed'] += 1;
    typeStats.set(type, (typeStats.get(type) || 0) + 1);

    const milestoneEntry = milestoneStats.get(milestone) || { milestone, open: 0, closed: 0, issues: [] };
    milestoneEntry[issue.state === 'OPEN' ? 'open' : 'closed'] += 1;
    milestoneEntry.issues.push(issue);
    milestoneStats.set(milestone, milestoneEntry);

    for (const label of uniqueLabels) {
      const stat = labelStats.get(label) || {
        label,
        family: familyOf(label),
        open: 0,
        closed: 0,
        highOpen: 0,
        bugOpen: 0,
        recentOpen: 0,
      };

      if (issue.state === 'OPEN') {
        stat.open += 1;
        if (['priority:P0', 'priority:P1'].includes(priority)) stat.highOpen += 1;
        if (issue.labels.includes('bug')) stat.bugOpen += 1;
        if (issue.updatedAt && new Date(issue.updatedAt) >= new Date(Date.now() - 1000 * 60 * 60 * 24 * 14)) {
          stat.recentOpen += 1;
        }
      } else {
        stat.closed += 1;
      }

      labelStats.set(label, stat);

      const family = familyOf(label);
      const familyEntry = familyStats.get(family);
      familyEntry.issueIds.add(issue.number);
      if (issue.state === 'OPEN') familyEntry.openIds.add(issue.number);
      if (issue.state === 'CLOSED') familyEntry.closedIds.add(issue.number);

      if (family === 'area') {
        const areaEntry = areaStats.get(label) || { label, open: 0, closed: 0 };
        areaEntry[issue.state === 'OPEN' ? 'open' : 'closed'] += 1;
        areaStats.set(label, areaEntry);
      }
    }
  }

  for (const familyEntry of familyStats.values()) {
    const topLabel = [...labelStats.values()]
      .filter((stat) => stat.family === [...familyStats.entries()].find(([, value]) => value === familyEntry)[0])
      .sort((a, b) => (b.open + b.closed) - (a.open + a.closed))[0];
    familyEntry.topLabel = topLabel ? topLabel.label : 'No labels';
    familyEntry.topCount = topLabel ? topLabel.open + topLabel.closed : 0;
  }

  const milestoneSeries = [...milestoneStats.values()].sort((a, b) => {
    if (b.open !== a.open) return b.open - a.open;
    return a.milestone.localeCompare(b.milestone);
  });

  const topAreas = [...areaStats.values()]
    .sort((a, b) => {
      if (b.open !== a.open) return b.open - a.open;
      if (b.closed !== a.closed) return b.closed - a.closed;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 8);

  const hotspotRows = [...labelStats.values()]
    .map((stat) => ({
      ...stat,
      score: stat.open * 4 + stat.highOpen * 5 + stat.bugOpen * 4 + stat.recentOpen * 2,
      total: stat.open + stat.closed,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.open !== a.open) return b.open - a.open;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 8);

  const riskIssues = openIssues
    .slice()
    .sort((a, b) => {
      const priorityRank = PRIORITY_ORDER.indexOf(priorityOf(a)) - PRIORITY_ORDER.indexOf(priorityOf(b));
      if (priorityRank !== 0) return priorityRank;
      const bugDiff = Number(b.labels.includes('bug')) - Number(a.labels.includes('bug'));
      if (bugDiff !== 0) return bugDiff;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    })
    .slice(0, 10);

  const weeks = [];
  const now = new Date();
  const start = weekStart(now.toISOString());
  for (let index = FLOW_LOOKBACK_WEEKS - 1; index >= 0; index -= 1) {
    const week = new Date(start);
    week.setUTCDate(week.getUTCDate() - index * 7);
    weeks.push(weekKey(week));
  }

  const openedByWeek = Object.fromEntries(weeks.map((key) => [key, 0]));
  const closedByWeek = Object.fromEntries(weeks.map((key) => [key, 0]));
  for (const issue of issues) {
    const openedKey = weekKey(weekStart(issue.createdAt));
    if (openedKey && openedKey in openedByWeek) openedByWeek[openedKey] += 1;
    const closedKey = weekKey(weekStart(issue.closedAt));
    if (closedKey && closedKey in closedByWeek) closedByWeek[closedKey] += 1;
  }

  const lookbackStart = new Date(`${weeks[0]}T00:00:00Z`);
  let cumulativeScope = issues.filter((issue) => issue.createdAt && new Date(issue.createdAt) < lookbackStart).length;
  let cumulativeCompleted = issues.filter((issue) => issue.closedAt && new Date(issue.closedAt) < lookbackStart).length;
  const burnupSeries = weeks.map((key) => {
    cumulativeScope += openedByWeek[key];
    cumulativeCompleted += closedByWeek[key];
    return {
      label: shortWeekLabel(key),
      scope: cumulativeScope,
      completed: cumulativeCompleted,
      backlog: cumulativeScope - cumulativeCompleted,
    };
  });

  const closureSpeedSeries = CLOSURE_SPEED_BUCKETS.map((bucket) => ({
    ...bucket,
    count: 0,
    share: 0,
  }));
  const closureDurations = [];

  let closedWithTiming = 0;
  for (const issue of closedIssues) {
    const durationMs = closureDurationMs(issue);
    if (durationMs === null) continue;
    closedWithTiming += 1;
    closureDurations.push(durationMs);
    for (const bucket of closureSpeedSeries) {
      if (durationMs <= bucket.limitMs) bucket.count += 1;
    }
  }
  closureDurations.sort((a, b) => a - b);

  for (const bucket of closureSpeedSeries) {
    bucket.share = closedWithTiming ? bucket.count / closedWithTiming : 0;
  }

  const agingSeries = AGING_BUCKETS.map((bucket) => ({
    ...bucket,
    total: 0,
    highPriority: 0,
    other: 0,
  }));

  let staleOpenCount = 0;
  for (const issue of openIssues) {
    const ageMs = issueAgeMs(issue, nowMs);
    if (ageMs === null) continue;
    const ageDays = ageMs / DAY_MS;
    const bucket = agingSeries.find((entry) => ageDays >= entry.minDays && ageDays < entry.maxDays);
    if (!bucket) continue;
    bucket.total += 1;
    if (['priority:P0', 'priority:P1'].includes(priorityOf(issue))) {
      bucket.highPriority += 1;
    } else {
      bucket.other += 1;
    }
    if (ageDays >= 30) staleOpenCount += 1;
  }

  const familyRows = Object.entries(FAMILY_LABELS)
    .map(([family, label]) => {
      const entry = familyStats.get(family);
      return {
        family,
        label,
        issueCount: entry.issueIds.size,
        openCount: entry.openIds.size,
        closedCount: entry.closedIds.size,
        topLabel: entry.topLabel,
        topCount: entry.topCount,
      };
    })
    .filter((row) => row.issueCount > 0);

  const milestoneHealth = milestoneSeries.map((row) => ({
    ...row,
    total: row.open + row.closed,
    completion: row.open + row.closed ? row.closed / (row.open + row.closed) : 0,
  }));

  return {
    issues,
    openIssues,
    closedIssues,
    metrics: {
      total: issues.length,
      open: openIssues.length,
      closed: closedIssues.length,
      closureRate: issues.length ? closedIssues.length / issues.length : 0,
      medianCloseMs: percentile(closureDurations, 0.5),
      p90CloseMs: percentile(closureDurations, 0.9),
      highPriorityOpen: openIssues.filter((issue) => ['priority:P0', 'priority:P1'].includes(priorityOf(issue))).length,
      staleOpenCount,
      milestoneCoverage: issues.length ? issues.filter((issue) => issue.milestone).length / issues.length : 0,
    },
    milestoneSeries,
    prioritySeries: PRIORITY_ORDER.map((priority) => ({
      label: PRIORITY_LABELS[priority],
      open: priorityStats.get(priority).open,
      closed: priorityStats.get(priority).closed,
    })),
    typeSeries: TYPE_ORDER.map((type) => ({
      label: TYPE_LABELS[type],
      value: typeStats.get(type) || 0,
    })).filter((row) => row.value > 0),
    areaSeries: topAreas,
    hotspotRows,
    riskIssues,
    familyRows,
    milestoneHealth,
    burnupSeries,
    agingSeries,
    activitySeries: weeks.map((key) => ({
      label: shortWeekLabel(key),
      opened: openedByWeek[key],
      closed: closedByWeek[key],
    })),
    closureSpeedSeries,
    closureSpeedBase: closedWithTiming,
  };
}

function renderMetrics(view) {
  const metrics = [
    {
      label: 'Issues In Scope',
      value: view.metrics.total,
      sub: `${view.metrics.open} open / ${view.metrics.closed} closed`,
    },
    {
      label: 'Closure Rate',
      value: formatPct(view.metrics.closureRate),
      sub: 'closed share in the current slice',
    },
    {
      label: 'Median Time To Close',
      value: formatDuration(view.metrics.medianCloseMs),
      sub: view.metrics.p90CloseMs ? `p90 ${formatDuration(view.metrics.p90CloseMs)}` : 'not enough closed issues yet',
    },
    {
      label: 'High Priority Open',
      value: view.metrics.highPriorityOpen,
      sub: 'open P0 or P1 issues',
    },
    {
      label: 'Stale Open >30d',
      value: view.metrics.staleOpenCount,
      sub: 'open issues older than 30 days',
    },
    {
      label: 'Milestone Coverage',
      value: formatPct(view.metrics.milestoneCoverage),
      sub: 'issues assigned to a milestone',
    },
  ];

  elements.metrics.innerHTML = metrics
    .map(
      (metric) => `
        <div class="metric-card">
          <div class="metric-label">${esc(metric.label)}</div>
          <div class="metric-value">${esc(metric.value)}</div>
          <div class="metric-sub">${esc(metric.sub)}</div>
        </div>
      `,
    )
    .join('');
}

function renderFamilyPressure(view) {
  if (!view.familyRows.length) {
    elements.familyPressure.innerHTML = '<div class="empty">No family data is available for the current filter.</div>';
    return;
  }

  elements.familyPressure.innerHTML = view.familyRows
    .map(
      (row) => `
        <div class="family-card">
          <div class="family-head">
            <div class="family-title">${esc(row.label)}</div>
            <div class="family-metric">${row.issueCount}</div>
          </div>
          <div class="family-sub">${esc(row.topLabel)}${row.topCount ? ` · ${row.topCount} issues` : ''}</div>
          <div class="bar"><span style="width:${Math.max(8, (row.closedCount / Math.max(row.issueCount, 1)) * 100)}%"></span></div>
          <div class="family-sub">${row.openCount} open / ${row.closedCount} closed</div>
        </div>
      `,
    )
    .join('');
}

function renderHotspots(view) {
  if (!view.hotspotRows.length) {
    elements.hotspots.innerHTML = '<div class="empty">No hotspot labels are visible in the current filter.</div>';
    return;
  }

  elements.hotspots.innerHTML = view.hotspotRows
    .map(
      (row) => `
        <div class="hotspot-row">
          <div class="hotspot-head">
            <div class="hotspot-title">${esc(row.label)}</div>
            <div class="hotspot-value">${row.score}</div>
          </div>
          <div class="hotspot-sub">${esc(FAMILY_LABELS[row.family] || row.family)} pressure score</div>
          <div class="hotspot-meta">
            <span class="badge">${row.open} open</span>
            <span class="badge">${row.closed} closed</span>
            <span class="badge">${row.highOpen} high-priority open</span>
            <span class="badge">${row.bugOpen} open bugs</span>
          </div>
        </div>
      `,
    )
    .join('');
}

function renderRiskList(view) {
  if (!view.riskIssues.length) {
    elements.riskList.innerHTML = '<div class="empty">No open issues match the current filter.</div>';
    return;
  }

  elements.riskList.innerHTML = view.riskIssues
    .map((issue) => {
      const priority = priorityOf(issue);
      const type = typeOf(issue);
      const area = areaLabels(issue)[0] || 'No area';
      return `
        <a class="list-item" href="${esc(issue.url)}" target="_blank" rel="noreferrer">
          <div class="list-top">
            <div class="list-title">#${issue.number} · ${esc(issue.title)}</div>
          </div>
          <div class="list-sub">Updated ${esc(formatDate(issue.updatedAt))} · ${esc(issue.milestone || 'No milestone')}</div>
          <div class="list-meta">
            <span class="badge">${esc(PRIORITY_LABELS[priority])}</span>
            <span class="badge">${esc(TYPE_LABELS[type])}</span>
            <span class="badge">${esc(area.replace('area:', ''))}</span>
          </div>
        </a>
      `;
    })
    .join('');
}

function renderMilestoneHealth(view) {
  if (!view.milestoneHealth.length) {
    elements.milestoneHealth.innerHTML = '<div class="empty">No milestone rows are available for the current filter.</div>';
    elements.milestoneMeta.textContent = '0 milestones';
    return;
  }

  elements.milestoneMeta.textContent = `${view.milestoneHealth.length} milestone${view.milestoneHealth.length === 1 ? '' : 's'}`;
  elements.milestoneHealth.innerHTML = view.milestoneHealth
    .map(
      (row) => `
        <div class="milestone-card">
          <div class="milestone-head">
            <div class="milestone-title">${esc(row.milestone)}</div>
            <div class="milestone-metric">${formatPct(row.completion)}</div>
          </div>
          <div class="milestone-sub">${row.total} issues · ${row.open} open / ${row.closed} closed</div>
          <div class="bar"><span style="width:${Math.max(8, row.completion * 100)}%"></span></div>
        </div>
      `,
    )
    .join('');
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          color: COLORS.muted,
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        padding: 12,
        titleColor: '#f8fafc',
        bodyColor: '#dbeafe',
      },
    },
    scales: {
      x: {
        grid: { color: COLORS.grid },
        ticks: { color: COLORS.muted },
      },
      y: {
        grid: { color: COLORS.grid },
        ticks: { color: COLORS.muted },
      },
    },
  };
}

function upsertChart(key, canvasId, config) {
  if (charts[key]) charts[key].destroy();
  const canvas = document.getElementById(canvasId);
  charts[key] = new Chart(canvas.getContext('2d'), config);
}

function renderMilestoneChart(view) {
  const series = view.milestoneSeries.length
    ? view.milestoneSeries
    : [{ milestone: 'No data', open: 0, closed: 0 }];

  upsertChart('milestone', 'milestone-chart', {
    type: 'bar',
    data: {
      labels: series.map((row) => row.milestone),
      datasets: [
        {
          label: 'Open',
          data: series.map((row) => row.open),
          backgroundColor: COLORS.open,
          borderRadius: 8,
        },
        {
          label: 'Closed',
          data: series.map((row) => row.closed),
          backgroundColor: COLORS.closed,
          borderRadius: 8,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      scales: {
        x: { ...baseChartOptions().scales.x, stacked: true },
        y: { ...baseChartOptions().scales.y, stacked: true, beginAtZero: true },
      },
    },
  });
}

function renderPriorityChart(view) {
  const series = view.prioritySeries;
  upsertChart('priority', 'priority-chart', {
    type: 'bar',
    data: {
      labels: series.map((row) => row.label),
      datasets: [
        {
          label: 'Open',
          data: series.map((row) => row.open),
          backgroundColor: '#ef4444',
          borderRadius: 8,
        },
        {
          label: 'Closed',
          data: series.map((row) => row.closed),
          backgroundColor: '#22c55e',
          borderRadius: 8,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      indexAxis: 'y',
      scales: {
        x: { ...baseChartOptions().scales.x, stacked: true, beginAtZero: true },
        y: { ...baseChartOptions().scales.y, stacked: true },
      },
    },
  });
}

function renderTypeChart(view) {
  const series = view.typeSeries.length
    ? view.typeSeries
    : [{ label: 'No data', value: 1 }];

  upsertChart('type', 'type-chart', {
    type: 'doughnut',
    data: {
      labels: series.map((row) => row.label),
      datasets: [
        {
          data: series.map((row) => row.value),
          backgroundColor: [COLORS.bug, COLORS.enhancement, COLORS.area, COLORS.priority, COLORS.support],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: COLORS.muted,
            boxWidth: 10,
          },
        },
        tooltip: baseChartOptions().plugins.tooltip,
      },
    },
  });
}

function renderActivityChart(view) {
  upsertChart('activity', 'activity-chart', {
    type: 'line',
    data: {
      labels: view.activitySeries.map((row) => row.label),
      datasets: [
        {
          label: 'Opened',
          data: view.activitySeries.map((row) => row.opened),
          borderColor: COLORS.open,
          backgroundColor: 'rgba(18, 52, 89, 0.12)',
          fill: true,
          tension: 0.32,
        },
        {
          label: 'Closed',
          data: view.activitySeries.map((row) => row.closed),
          borderColor: COLORS.closed,
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.32,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      scales: {
        x: baseChartOptions().scales.x,
        y: { ...baseChartOptions().scales.y, beginAtZero: true },
      },
    },
  });
}

function renderBurnupChart(view) {
  upsertChart('burnup', 'burnup-chart', {
    type: 'line',
    data: {
      labels: view.burnupSeries.map((row) => row.label),
      datasets: [
        {
          label: 'Total Scope',
          data: view.burnupSeries.map((row) => row.scope),
          borderColor: COLORS.open,
          backgroundColor: 'rgba(18, 52, 89, 0.08)',
          fill: false,
          tension: 0.28,
        },
        {
          label: 'Completed',
          data: view.burnupSeries.map((row) => row.completed),
          borderColor: COLORS.closed,
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
          fill: false,
          tension: 0.28,
        },
        {
          label: 'Open Backlog',
          data: view.burnupSeries.map((row) => row.backlog),
          borderColor: COLORS.priority,
          backgroundColor: 'rgba(249, 115, 22, 0.08)',
          borderDash: [6, 4],
          fill: false,
          tension: 0.28,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      scales: {
        x: baseChartOptions().scales.x,
        y: { ...baseChartOptions().scales.y, beginAtZero: false },
      },
    },
  });
}

function renderAgingChart(view) {
  if (elements.agingMeta) {
    const staleShare = view.openIssues.length ? view.metrics.staleOpenCount / view.openIssues.length : 0;
    elements.agingMeta.textContent = view.openIssues.length
      ? `${view.metrics.staleOpenCount} stale · ${formatPct(staleShare)} of open`
      : '0 stale';
  }

  upsertChart('aging', 'aging-chart', {
    type: 'bar',
    data: {
      labels: view.agingSeries.map((row) => row.label),
      datasets: [
        {
          label: 'High Priority Open',
          data: view.agingSeries.map((row) => row.highPriority),
          backgroundColor: '#ef4444',
          borderRadius: 8,
        },
        {
          label: 'Other Open',
          data: view.agingSeries.map((row) => row.other),
          backgroundColor: 'rgba(18, 52, 89, 0.24)',
          borderRadius: 8,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      indexAxis: 'y',
      scales: {
        x: { ...baseChartOptions().scales.x, stacked: true, beginAtZero: true },
        y: { ...baseChartOptions().scales.y, stacked: true },
      },
    },
  });
}

function renderAreasChart(view) {
  const series = view.areaSeries.length
    ? view.areaSeries
    : [{ label: 'No data', open: 0, closed: 0 }];

  upsertChart('areas', 'areas-chart', {
    type: 'bar',
    data: {
      labels: series.map((row) => row.label.replace('area:', '')),
      datasets: [
        {
          label: 'Open',
          data: series.map((row) => row.open),
          backgroundColor: COLORS.area,
          borderRadius: 8,
        },
        {
          label: 'Closed',
          data: series.map((row) => row.closed),
          backgroundColor: 'rgba(59, 130, 246, 0.28)',
          borderRadius: 8,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      indexAxis: 'y',
      scales: {
        x: { ...baseChartOptions().scales.x, stacked: true, beginAtZero: true },
        y: { ...baseChartOptions().scales.y, stacked: true },
      },
    },
  });
}

function renderClosureSpeedChart(view) {
  upsertChart('closure-speed', 'closure-speed-chart', {
    type: 'bar',
    data: {
      labels: view.closureSpeedSeries.map((row) => row.label),
      datasets: [
        {
          label: 'Closed within threshold',
          data: view.closureSpeedSeries.map((row) => row.count),
          backgroundColor: view.closureSpeedSeries.map((row) => row.color),
          borderRadius: 8,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      plugins: {
        ...baseChartOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            afterLabel(context) {
              const bucket = view.closureSpeedSeries[context.dataIndex];
              return `${formatPct(bucket.share)} of timed closed issues`;
            },
          },
        },
      },
      scales: {
        x: baseChartOptions().scales.x,
        y: { ...baseChartOptions().scales.y, beginAtZero: true },
      },
    },
  });
}

function updateScopeMeta() {
  const parts = [];
  if (state.stateFilter !== 'all') parts.push(state.stateFilter.toUpperCase());
  if (state.milestone !== 'all') parts.push(state.milestone);
  if (state.family !== 'all') parts.push(FAMILY_LABELS[state.family]);
  if (state.priority !== 'all') parts.push(state.priority === 'high' ? 'P0 / P1' : PRIORITY_LABELS[state.priority]);
  elements.scopeMeta.textContent = parts.length ? parts.join(' · ') : 'Observing all issues';
}

function render() {
  renderStatePills();
  updateScopeMeta();
  const view = buildView();
  renderMetrics(view);
  renderFamilyPressure(view);
  renderHotspots(view);
  renderRiskList(view);
  renderMilestoneHealth(view);
  renderMilestoneChart(view);
  renderPriorityChart(view);
  renderTypeChart(view);
  renderActivityChart(view);
  renderBurnupChart(view);
  renderAgingChart(view);
  renderAreasChart(view);
  renderClosureSpeedChart(view);
}

async function loadSnapshot() {
  const attempts = [
    { url: LIVE_DATA_URL, source: 'live' },
    { url: `${SNAPSHOT_DATA_URL}?ts=${Date.now()}`, source: 'snapshot' },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to load ${attempt.source} data: ${response.status}`);
      snapshot = await response.json();
      syncSnapshotMeta(attempt.source);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!snapshot) {
    throw lastError || new Error('Unable to load dashboard data.');
  }

  renderSelectOptions(
    elements.milestoneSelect,
    [{ value: 'all', label: 'All milestones' }].concat(
      ['No milestone'].concat(snapshot.milestones || []).map((milestone) => ({
        value: milestone,
        label: milestone,
      })),
    ),
    state.milestone,
  );
}

function startAutoRefresh() {
  if (autoRefreshHandle) window.clearInterval(autoRefreshHandle);
  autoRefreshHandle = window.setInterval(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      await loadSnapshot();
      render();
    } catch (error) {
      console.warn('Auto-refresh failed', error);
    }
  }, LIVE_REFRESH_INTERVAL_MS);
}

function bindControls() {
  renderSelectOptions(elements.familySelect, FAMILY_OPTIONS, state.family);
  renderSelectOptions(elements.prioritySelect, PRIORITY_FILTER_OPTIONS, state.priority);

  elements.milestoneSelect.addEventListener('change', (event) => {
    state.milestone = event.target.value;
    render();
  });

  elements.familySelect.addEventListener('change', (event) => {
    state.family = event.target.value;
    render();
  });

  elements.prioritySelect.addEventListener('change', (event) => {
    state.priority = event.target.value;
    render();
  });

  elements.refreshButton.addEventListener('click', async () => {
    elements.refreshButton.disabled = true;
    elements.refreshButton.textContent = 'Refreshing…';
    try {
      await loadSnapshot();
      render();
    } finally {
      elements.refreshButton.disabled = false;
      elements.refreshButton.textContent = 'Refresh Live Data';
    }
  });
}

async function init() {
  bindControls();
  await loadSnapshot();
  render();
  startAutoRefresh();
}

init().catch((error) => {
  console.error(error);
  elements.metrics.innerHTML = `<div class="empty">Could not load the dashboard data.<br><br>${esc(error.message || String(error))}</div>`;
});
