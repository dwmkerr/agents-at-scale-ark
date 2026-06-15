import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  AUTH_COOKIE_NAMES,
  SESSION_COOKIE_NAME,
  useSecureCookies,
} from '@/lib/auth/auth-config';
import { openidConfigManager } from '@/lib/auth/openid-config-manager';
import { OIDC_END_SESSION_URL } from '@/lib/constants/auth';

// NextAuth splits a session JWT larger than ~4KB into `${name}.0`, `${name}.1`,
// ... Large OIDC tokens (id + access + refresh) routinely exceed this, and the
// client-side signOut() does not reliably clear every chunk — leaving the
// session valid after "logout". Clear the base name and chunk variants.
const MAX_COOKIE_CHUNKS = 8;

function clearSessionCookies(res: NextResponse) {
  // Clear the session cookie (and its chunks) plus the OIDC-flow cookies
  // (state, PKCE, nonce, callback-url, CSRF) — a leftover `state` cookie breaks
  // the next sign-in with a CallbackRouteError.
  const names = [...AUTH_COOKIE_NAMES];
  for (let i = 0; i < MAX_COOKIE_CHUNKS; i++) {
    names.push(`${SESSION_COOKIE_NAME}.${i}`);
  }
  for (const name of names) {
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

  // Logout must never depend on the IdP being reachable, so local cookie
  // clearing is the safe floor. Precedence: explicit OIDC_END_SESSION_URL env >
  // discovered end_session_endpoint > local-only. Discovery is wrapped so a
  // failed well-known fetch degrades to local sign-out instead of surfacing
  // error=Configuration.
  const localSignout = () =>
    clearSessionCookies(NextResponse.redirect(new URL('/signout', baseURL)));

  let endSessionEndpoint = OIDC_END_SESSION_URL;

  if (!endSessionEndpoint) {
    try {
      const openidConfig = await openidConfigManager.getConfig();
      endSessionEndpoint = openidConfig.end_session_endpoint ?? '';
    } catch (error) {
      console.warn('Failed to fetch OIDC config for federated logout', error);
      console.warn('Performing local sign-out only');
      return localSignout();
    }
  }

  // Not every OIDC provider supports RP-initiated logout. Dex, for example, is
  // a stateless connector with no session to end, so it advertises no
  // end_session_endpoint (dexidp/dex#1697). Fabricating a logout URL just 404s
  // and leaves the local session intact, so terminate locally instead.
  if (!endSessionEndpoint) {
    console.warn('Provider does not support RP-initiated logout (e.g., Dex)');
    console.warn('Performing local sign-out only');
    return localSignout();
  }

  const url = new URL(endSessionEndpoint);

  url.searchParams.append('id_token_hint', String(token.id_token));
  url.searchParams.append('post_logout_redirect_uri', redirectURL);
  url.searchParams.append('client_id', process.env.OIDC_CLIENT_ID ?? '');

  // Clear the local session too, then hand off to the provider's logout.
  return clearSessionCookies(NextResponse.redirect(url));
}
