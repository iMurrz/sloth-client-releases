const crypto = require('node:crypto');
const { postForm, postJson, getJson, request, HttpError } = require('../http');

/**
 * Sign-in always happens in the player's own browser (RFC 8252), never in a launcher-controlled window.
 * Scopes are the minimum Xbox Live needs; nothing else on the Microsoft account is requested.
 */
const FLOWS = {
  // Community-standard client ID (the one Mojang's launcher uses). Its only registered redirect is Microsoft's
  // own page, so the browser flow is the OAuth device-code grant: the player signs in at microsoft.com/link.
  live: {
    kind: 'device',
    deviceCode: 'https://login.live.com/oauth20_connect.srf',
    token: 'https://login.live.com/oauth20_token.srf',
    scope: 'service::user.auth.xboxlive.com::MBI_SSL',
    tickets: token => [`t=${token}`, token]
  },
  // Your own Azure app (register "http://localhost" as a Mobile/desktop redirect URI). Authorization code
  // grant with PKCE (S256) and a single-use loopback redirect.
  azure: {
    kind: 'loopback',
    authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    scope: 'XboxLive.signin offline_access',
    tickets: token => [`d=${token}`]
  }
};

class AuthError extends Error {
  constructor(message, code = 'auth') {
    super(message);
    this.code = code;
  }
}

function flowFor({ mode, clientId }) {
  const base = FLOWS[mode];
  if (!base) throw new AuthError(`Unknown sign-in mode "${mode}"`, 'config');
  if (!/^[0-9a-fA-F-]{16,36}$/.test(clientId || '')) throw new AuthError('The sign-in client ID is not valid. Check Settings > Advanced.', 'config');
  return { ...base, mode, clientId };
}

const parseBody = body => { try { return JSON.parse(body); } catch { return null; } };

/** OAuth error body from a failed token-endpoint call, or null for non-OAuth failures. */
function oauthError(err) {
  return err instanceof HttpError && err.status >= 400 && err.status < 500 ? parseBody(err.body) || {} : null;
}

async function tokenRequest(flow, form) {
  try {
    const res = await postForm(flow.token, { client_id: flow.clientId, scope: flow.scope, ...form });
    if (!res.access_token) throw new AuthError('Microsoft returned no access token.');
    return { accessToken: res.access_token, refreshToken: res.refresh_token || form.refresh_token };
  } catch (err) {
    const body = oauthError(err);
    if (!body) throw err;
    if (body.error === 'invalid_grant') throw new AuthError('Your Microsoft sign-in has expired. Please sign in again.', 'reauth');
    const wrapped = new AuthError(body.error_description?.split('\r\n')[0] || 'Microsoft rejected the sign-in.', 'oauth');
    wrapped.oauth = body.error;
    throw wrapped;
  }
}

const refreshMicrosoft = (flow, refreshToken) => tokenRequest(flow, { grant_type: 'refresh_token', refresh_token: refreshToken });

const XSTS_ERRORS = {
  2148916227: 'This account is banned from Xbox services.',
  2148916229: 'This account is restricted by parental controls and cannot play online.',
  2148916233: "This Microsoft account doesn't have an Xbox profile yet. Sign in once at minecraft.net, then try again.",
  2148916234: 'You need to accept the Xbox terms first. Sign in at xbox.com, then try again.',
  2148916235: "Xbox Live isn't available in your country or region.",
  2148916236: 'This account needs adult verification on the Xbox website.',
  2148916237: 'This account needs adult verification on the Xbox website.',
  2148916238: 'This is a child account. An adult needs to add it to a Microsoft Family group first.'
};

async function xsts(userToken, relyingParty) {
  try {
    return await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
      RelyingParty: relyingParty,
      TokenType: 'JWT'
    });
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      const code = parseBody(err.body)?.XErr;
      throw new AuthError(XSTS_ERRORS[code] || `Xbox Live refused the sign-in (error ${code || 401}).`, 'xbox');
    }
    throw err;
  }
}

async function xboxUserToken(flow, msAccessToken) {
  let lastError;
  for (const ticket of flow.tickets(msAccessToken)) {
    try {
      return await postJson('https://user.auth.xboxlive.com/user/authenticate', {
        Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: ticket },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      });
    } catch (err) {
      lastError = err;
      if (!(err instanceof HttpError && err.status >= 400 && err.status < 500)) throw err;
    }
  }
  throw new AuthError(`Xbox Live rejected the Microsoft sign-in (${lastError?.status || 'error'}).`, 'xbox');
}

/** Microsoft access token → Xbox Live → XSTS → Minecraft access token (valid ~24h). */
async function minecraftLogin(flow, msAccessToken) {
  const xbl = await xboxUserToken(flow, msAccessToken);
  const mcXsts = await xsts(xbl.Token, 'rp://api.minecraftservices.com/');
  const uhs = mcXsts.DisplayClaims?.xui?.[0]?.uhs;
  let mc;
  try {
    mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', { identityToken: `XBL3.0 x=${uhs};${mcXsts.Token}` });
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) throw new AuthError('Too many sign-in attempts. Wait a minute and try again.', 'rate');
    if (err instanceof HttpError && err.status === 403) {
      throw new AuthError(flow.mode === 'azure'
        ? "This Azure app isn't approved for the Minecraft API yet. Use the default sign-in until Mojang approves it."
        : 'Minecraft services refused the sign-in.', 'minecraft');
    }
    throw err;
  }
  // The Xbox user ID (xuid) is passed to the game like the official launcher does; it's optional.
  const xuid = await xsts(xbl.Token, 'http://xboxlive.com').then(r => r.DisplayClaims?.xui?.[0]?.xid).catch(() => undefined);
  return { accessToken: mc.access_token, expiresAt: Date.now() + (mc.expires_in || 86400) * 1000, xuid: /^\d+$/.test(xuid || '') ? xuid : undefined };
}

const bearer = token => ({ headers: { Authorization: `Bearer ${token}` } });

/** Confirms the account owns Minecraft: Java Edition (purchase or Game Pass) via Mojang's license endpoint. */
async function assertOwnership(mcAccessToken) {
  let license;
  try {
    license = await getJson(`https://api.minecraftservices.com/entitlements/license?requestId=${crypto.randomUUID()}`, bearer(mcAccessToken));
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) throw new AuthError('Your Minecraft session expired. Please sign in again.', 'reauth');
    // The license service being down shouldn't lock players out; the profile check below still applies.
    return;
  }
  const owned = (license.items || []).some(item => item.name === 'product_minecraft' || item.name === 'game_minecraft');
  if (!owned) throw new AuthError("This Microsoft account doesn't own Minecraft: Java Edition.", 'no-game');
}

async function fetchProfile(mcAccessToken) {
  let profile;
  try {
    profile = await getJson('https://api.minecraftservices.com/minecraft/profile', bearer(mcAccessToken));
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) throw new AuthError("This account owns Minecraft but hasn't picked a username yet. Set one at minecraft.net.", 'no-game');
    if (err instanceof HttpError && err.status === 401) throw new AuthError('Your Minecraft session expired. Please sign in again.', 'reauth');
    throw err;
  }
  if (!/^[0-9a-f]{32}$/.test(profile.id) || !/^[A-Za-z0-9_]{1,16}$/.test(profile.name)) throw new AuthError('Minecraft returned an unexpected profile.');
  const skin = profile.skins?.find(s => s.state === 'ACTIVE') || profile.skins?.[0];
  return { uuid: profile.id, name: profile.name, skinUrl: skin?.url };
}

/** Downloads the skin texture as a data URL (only from Mojang's texture server). */
async function fetchSkin(skinUrl) {
  if (!skinUrl) return undefined;
  const url = new URL(skinUrl);
  if (url.hostname !== 'textures.minecraft.net') return undefined;
  url.protocol = 'https:';
  const res = await request(url.toString(), { timeout: 10000 });
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 64 * 1024 || bytes.readUInt32BE(0) !== 0x89504e47) return undefined;
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

module.exports = { AuthError, flowFor, tokenRequest, oauthError, refreshMicrosoft, minecraftLogin, assertOwnership, fetchProfile, fetchSkin };
