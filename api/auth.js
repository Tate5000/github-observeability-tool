import {
  createAuthCookieHeader,
  createClearAuthCookieHeader,
  getSitePassword,
  getRequestHeader,
  isPasswordProtectionEnabled,
} from '../auth-utils.js';

const NO_STORE_HEADER = 'no-store, no-cache, must-revalidate, max-age=0';

function sendJson(response, status, payload, extraHeaders = {}) {
  response.statusCode = status;
  response.setHeader('Cache-Control', NO_STORE_HEADER);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  Object.entries(extraHeaders).forEach(([key, value]) => {
    response.setHeader(key, value);
  });

  response.end(JSON.stringify(payload));
}

async function readRawBody(request) {
  if (typeof request.body === 'string') return request.body;
  if (Buffer.isBuffer(request.body)) return request.body.toString('utf8');
  if (request.body && typeof request.body === 'object') return JSON.stringify(request.body);

  return new Promise((resolve, reject) => {
    let rawBody = '';
    request.setEncoding?.('utf8');
    request.on('data', (chunk) => {
      rawBody += chunk;
    });
    request.on('end', () => resolve(rawBody));
    request.on('error', reject);
  });
}

async function readPassword(request) {
  const contentType = getRequestHeader(request, 'content-type');
  const rawBody = await readRawBody(request);

  if (contentType.includes('application/json')) {
    try {
      const payload = JSON.parse(rawBody || '{}');
      return String(payload.password || '');
    } catch {
      return '';
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const params = new URLSearchParams(rawBody);
    return String(params.get('password') || '');
  }

  return '';
}

async function handleLogin(request, response) {
  if (!isPasswordProtectionEnabled()) {
    sendJson(response, 200, { ok: true });
    return;
  }

  const submittedPassword = await readPassword(request);

  if (!submittedPassword || submittedPassword !== getSitePassword()) {
    sendJson(response, 401, { error: 'Invalid password.' });
    return;
  }

  sendJson(
    response,
    200,
    { ok: true },
    { 'Set-Cookie': createAuthCookieHeader() },
  );
}

function handleLogout(_request, response) {
  sendJson(response, 200, { ok: true }, { 'Set-Cookie': createClearAuthCookieHeader() });
}

function methodNotAllowed(response) {
  sendJson(response, 405, { error: 'Method not allowed.' });
}

export default async function handler(request, response) {
  if (request.method === 'POST') return handleLogin(request, response);
  if (request.method === 'DELETE') return handleLogout(request, response);
  return methodNotAllowed(response);
}
