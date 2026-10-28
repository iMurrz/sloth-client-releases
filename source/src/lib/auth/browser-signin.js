const http = require('node:http');
const crypto = require('node:crypto');
const { postForm } = require('../http');
const { AuthError, tokenRequest, oauthError } = require('./microsoft');

const base64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new AuthError('Sign-in was cancelled.', 'cancelled')); }, { once: true });
});
const cancelled = () => new AuthError('Sign-in was cancelled.', 'cancelled');

/** Only ever send the player to Microsoft's own HTTPS pages. */
function assertMicrosoftUrl(url) {
  const { protocol, hostname } = new URL(url);
  const ok = protocol === 'https:' && /(^|\.)(microsoft\.com|live\.com|microsoftonline\.com)$/.test(hostname);
  if (!ok) throw new AuthError('Microsoft returned an unexpected sign-in address.', 'oauth');
  return url;
}

/**
 * OAuth 2.0 device authorization grant (RFC 8628): the player signs in on microsoft.com/link in their own
 * browser and types the code shown in the launcher. The launcher never sees a password or a sign-in page.
 */
async function deviceCodeSignIn(flow, { openExternal, onPrompt, signal }) {
  const start = await postForm(flow.deviceCode, { client_id: flow.clientId, scope: flow.scope, response_type: 'device_code' });
  if (!/^[A-Z0-9-]{4,16}$/i.test(start.user_code || '') || typeof start.device_code !== 'string') throw new AuthError('Microsoft did not return a sign-in code.', 'oauth');
  const verificationUri = assertMicrosoftUrl(start.verification_uri);
  const expiresAt = Date.now() + (Number(start.expires_in) || 900) * 1000;
  let interval = Math.max(5, Number(start.interval) || 5) * 1000;
  onPrompt({ kind: 'device', userCode: start.user_code, verificationUri, expiresAt });
  await openExternal(verificationUri);

  while (Date.now() < expiresAt) {
    await sleep(interval, signal);
    try {
      return await tokenRequest(flow, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: start.device_code });
    } catch (err) {
      const code = err.oauth || oauthError(err)?.error;
      if (code === 'authorization_pending') continue;
      if (code === 'slow_down') { interval += 5000; continue; }
      if (code === 'expired_token') break;
      if (code === 'access_denied' || code === 'authorization_declined') throw cancelled();
      throw err;
    }
  }
  throw new AuthError('The sign-in code expired. Please try again.', 'expired');
}

const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>Sloth Client</title>
<body style="font-family:Segoe UI,sans-serif;background:#101014;color:#f5f3f0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="color:#ff7943">Signed in</h1><p>You can close this tab and return to Sloth Client.</p></div>`;
const FAIL_PAGE = DONE_PAGE.replace('Signed in', 'Sign-in not completed').replace('You can close this tab and return to Sloth Client.', 'Return to Sloth Client to try again.');

/**
 * OAuth 2.0 authorization code grant with PKCE (S256) and a loopback redirect (RFC 8252 §7.3), for players or
 * servers using their own Azure app. The listener is bound to 127.0.0.1 only, accepts exactly one request
 * with the matching `state`, never echoes request data back, and shuts down right after.
 */
function loopbackSignIn(flow, { openExternal, onPrompt, signal }) {
  return new Promise((resolve, reject) => {
    const state = base64url(crypto.randomBytes(24));
    const verifier = base64url(crypto.randomBytes(48));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    let settled = false;
    let callbackAccepted = false;
    let redirectUri;
    const server = http.createServer((req, res) => {
      const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" };
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method !== 'GET' || url.pathname !== '/' || settled || callbackAccepted || url.searchParams.get('state') !== state) {
        res.writeHead(404, headers).end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      callbackAccepted = true;
      if (error || !code) {
        res.writeHead(200, headers).end(FAIL_PAGE, () => finish(error === 'access_denied' ? cancelled() : new AuthError('Microsoft did not complete the sign-in.', 'oauth')));
        return;
      }
      res.writeHead(200, headers).end(DONE_PAGE);
      tokenRequest(flow, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier })
        .then(tokens => finish(null, tokens), err => finish(err));
    });
    const timeout = setTimeout(() => finish(new AuthError('Sign-in timed out. Please try again.', 'expired')), 10 * 60 * 1000);
    const onAbort = () => finish(cancelled());
    function finish(err, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      // Leave one short drain window for the OS to deliver the callback response.
      // Resolve only after the listener is closed, so callers cannot race cleanup.
      const drain = setTimeout(() => server.closeAllConnections?.(), 1000);
      drain.unref();
      setTimeout(() => server.close(() => {
        clearTimeout(drain);
        if (err) reject(err); else resolve(value);
      }), 100);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    server.headersTimeout = 10000;
    server.requestTimeout = 10000;
    server.maxConnections = 8;
    server.on('error', err => finish(err));
    server.listen(0, '127.0.0.1', async () => {
      // Azure matches "http://localhost" redirect URIs on any port for desktop apps.
      redirectUri = `http://localhost:${server.address().port}`;
      const params = new URLSearchParams({
        client_id: flow.clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query',
        scope: flow.scope, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account'
      });
      try {
        onPrompt({ kind: 'browser' });
        await openExternal(assertMicrosoftUrl(`${flow.authorize}?${params}`));
      } catch (err) {
        finish(err);
      }
    });
  });
}

function browserSignIn(flow, options) {
  return flow.kind === 'device' ? deviceCodeSignIn(flow, options) : loopbackSignIn(flow, options);
}

module.exports = { browserSignIn, assertMicrosoftUrl };
