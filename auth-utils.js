import crypto from 'node:crypto';

export const AUTH_COOKIE_NAME = 'pria_dashboard_access';

const TOKEN_SALT = 'github-observeability-tool';

export function getSitePassword() {
  return process.env.SITE_PASSWORD || '';
}

export function isPasswordProtectionEnabled() {
  return Boolean(getSitePassword());
}

export function createAuthToken(password = getSitePassword()) {
  if (!password) return '';

  return crypto
    .createHash('sha256')
    .update(`${TOKEN_SALT}:${password}`)
    .digest('hex');
}

export function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) return [part, ''];
        return [part.slice(0, separatorIndex), decodeURIComponent(part.slice(separatorIndex + 1))];
      }),
  );
}

export function getRequestHeader(request, name) {
  const headers = request?.headers;
  if (!headers) return '';

  if (typeof headers.get === 'function') {
    return headers.get(name) || '';
  }

  const headerValue = headers[String(name).toLowerCase()] ?? headers[name];
  if (Array.isArray(headerValue)) {
    return headerValue.join('; ');
  }

  return typeof headerValue === 'string' ? headerValue : '';
}

export function isAuthorizedRequest(request) {
  if (!isPasswordProtectionEnabled()) return true;

  const cookieHeader = getRequestHeader(request, 'cookie');
  const cookies = parseCookies(cookieHeader);
  return cookies[AUTH_COOKIE_NAME] === createAuthToken();
}

export function createAuthCookieHeader() {
  return [
    `${AUTH_COOKIE_NAME}=${createAuthToken()}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=1209600',
  ].join('; ');
}

export function createClearAuthCookieHeader() {
  return [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}
