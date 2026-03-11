import {
  createAuthCookieHeader,
  createClearAuthCookieHeader,
  getSitePassword,
  isPasswordProtectionEnabled,
} from '../auth-utils.js';

async function readPassword(request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await request.json().catch(() => ({}));
    return String(payload.password || '');
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    return String(formData.get('password') || '');
  }

  return '';
}

async function handleLogin(request) {
  if (!isPasswordProtectionEnabled()) {
    return Response.json({ ok: true }, { status: 200 });
  }

  const submittedPassword = await readPassword(request);

  if (!submittedPassword || submittedPassword !== getSitePassword()) {
    return Response.json(
      { error: 'Invalid password.' },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      },
    );
  }

  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Set-Cookie': createAuthCookieHeader(),
      },
    },
  );
}

function handleLogout() {
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Set-Cookie': createClearAuthCookieHeader(),
      },
    },
  );
}

function methodNotAllowed() {
  return Response.json({ error: 'Method not allowed.' }, { status: 405 });
}

export async function POST(request) {
  return handleLogin(request);
}

export async function DELETE() {
  return handleLogout();
}

export default {
  fetch(request) {
    if (request.method === 'POST') return handleLogin(request);
    if (request.method === 'DELETE') return handleLogout();
    return methodNotAllowed();
  },
};
