import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME, useSecureCookies } from '@/lib/auth/auth-config';
import { openidConfigManager } from '@/lib/auth/openid-config-manager';

// Number of chunk indices to clear. NextAuth splits a session JWT larger than
// ~4KB into `${name}.0`, `${name}.1`, ... Large OIDC tokens (id + access +
// refresh, e.g. from Dex) routinely exceed this, and the client-side signOut()
// does not always clear every chunk — leaving the session valid after "logout".
const MAX_COOKIE_CHUNKS = 8;

// Clear the session cookie (and any chunked variants) on a response, plus any
// extra cookies named in LOGOUT_CLEAR_COOKIES (comma-separated) for deployments
// that set additional auth/proxy cookies. Secure-prefixed cookies must be
// deleted with the same Secure/Path attributes they were set with.
function clearSessionCookies(res: NextResponse) {
  const names = [SESSION_COOKIE_NAME];
  for (let i = 0; i < MAX_COOKIE_CHUNKS; i++) {
    names.push(`${SESSION_COOKIE_NAME}.${i}`);
  }
  const extra = (process.env.LOGOUT_CLEAR_COOKIES ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  for (const name of [...names, ...extra]) {
    res.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      secure: useSecureCookies,
      httpOnly: true,
      sameSite: 'lax',
    });
  }
  return res;
}

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: SESSION_COOKIE_NAME,
  });

  const baseURL = process.env.BASE_URL;
  const redirectURL = `${baseURL}/signout`;
  if (!token?.id_token) {
    // no session, just go home
    return clearSessionCookies(NextResponse.redirect(new URL('/signout', baseURL)));
  }

  // Get or fetch the openid config from the OIDC provider's well-known configuration
  const openidConfig = await openidConfigManager.getConfig();

  // Not every OIDC provider supports RP-initiated logout. Dex, for example, is
  // a stateless connector with no session to end, so it advertises no
  // end_session_endpoint (dexidp/dex#1697). Fabricating a logout URL just 404s
  // and leaves the local session intact. When there is no end_session_endpoint,
  // there is nothing to terminate at the provider — clear the local session.
  if (!openidConfig.end_session_endpoint) {
    console.warn(
      'OIDC provider advertises no end_session_endpoint; performing local signout only',
    );
    return clearSessionCookies(
      NextResponse.redirect(new URL('/signout', baseURL)),
    );
  }

  const url = new URL(openidConfig.end_session_endpoint);

  url.searchParams.append('id_token_hint', String(token.id_token));
  url.searchParams.append('post_logout_redirect_uri', redirectURL);
  url.searchParams.append('client_id', process.env.OIDC_CLIENT_ID ?? '');

  // Clear the local session too, then hand off to the provider's logout.
  return clearSessionCookies(NextResponse.redirect(url));
}
