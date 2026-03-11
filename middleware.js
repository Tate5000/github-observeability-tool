import { isAuthorizedRequest, isPasswordProtectionEnabled } from './auth-utils.js';

export const config = {
  runtime: 'nodejs',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loginScreenHtml(currentPath) {
  const nextPath = escapeHtml(currentPath || '/');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Protected Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --page: #040806;
        --page-soft: #0b1310;
        --panel: rgba(10, 16, 14, 0.9);
        --line: rgba(146, 168, 159, 0.14);
        --ink: #eff8f2;
        --muted: #8ea29a;
        --brand: #d6ff72;
        --brand-soft: #74d8ff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Instrument Sans", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 20% 0%, rgba(214, 255, 114, 0.12), transparent 28%),
          radial-gradient(circle at 82% 8%, rgba(116, 216, 255, 0.12), transparent 26%),
          linear-gradient(180deg, var(--page) 0%, var(--page-soft) 100%);
      }

      .shell {
        width: min(520px, calc(100vw - 28px));
        padding: 30px;
        border-radius: 24px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(11, 18, 15, 0.96), rgba(6, 11, 9, 0.98));
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
      }

      .kicker {
        display: inline-flex;
        align-items: center;
        padding: 9px 12px;
        border-radius: 999px;
        border: 1px solid rgba(214, 255, 114, 0.24);
        background: rgba(214, 255, 114, 0.08);
        color: #d9f992;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.24em;
        text-transform: uppercase;
      }

      h1 {
        margin: 18px 0 10px;
        font-family: "Space Grotesk", "Instrument Sans", sans-serif;
        font-size: clamp(36px, 7vw, 56px);
        line-height: 0.92;
        letter-spacing: -0.05em;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
      }

      form {
        margin-top: 22px;
      }

      label {
        display: block;
        margin-bottom: 10px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      input {
        width: 100%;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.04);
        color: var(--ink);
        padding: 15px 16px;
        font: inherit;
      }

      button {
        margin-top: 14px;
        width: 100%;
        border: 1px solid rgba(214, 255, 114, 0.3);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(214, 255, 114, 0.16), rgba(214, 255, 114, 0.08));
        color: #f6ffd8;
        padding: 14px 16px;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        cursor: pointer;
      }

      .error {
        display: none;
        margin-top: 12px;
        color: #ff8e8b;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="kicker">Protected Access</div>
      <h1>Issue Observability</h1>
      <p>This dashboard is protected. Enter the access password to continue.</p>
      <form id="login-form">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <button type="submit">Unlock Dashboard</button>
        <div id="error" class="error">Password was not accepted.</div>
      </form>
    </div>
    <script>
      const form = document.getElementById('login-form');
      const error = document.getElementById('error');
      const next = ${JSON.stringify(nextPath)};

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.style.display = 'none';
        const password = document.getElementById('password').value;

        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password }),
        });

        if (!response.ok) {
          error.style.display = 'block';
          return;
        }

        window.location.replace(next);
      });
    </script>
  </body>
</html>`;
}

export default function middleware(request) {
  if (!isPasswordProtectionEnabled()) return;

  const url = new URL(request.url);

  if (url.pathname === '/api/auth' || url.pathname.startsWith('/.well-known/')) {
    return;
  }

  if (isAuthorizedRequest(request)) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
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

  return new Response(loginScreenHtml(url.pathname + url.search), {
    status: 401,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
