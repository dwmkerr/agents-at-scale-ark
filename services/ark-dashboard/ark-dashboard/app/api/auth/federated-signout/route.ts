import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/auth/auth-config';
import { openidConfigManager } from '@/lib/auth/openid-config-manager';

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: SESSION_COOKIE_NAME,
  });

  const baseURL = process.env.BASE_URL;
  const redirectURL = `${baseURL}/signout`;
  if (!token?.id_token) {
    return NextResponse.redirect(new URL('/signout', baseURL)); // no session, just go home
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
    return NextResponse.redirect(new URL('/signout', baseURL));
  }

  const url = new URL(openidConfig.end_session_endpoint);

  url.searchParams.append('id_token_hint', String(token.id_token));
  url.searchParams.append('post_logout_redirect_uri', redirectURL);
  url.searchParams.append('client_id', process.env.OIDC_CLIENT_ID ?? '');

  return NextResponse.redirect(url);
}
