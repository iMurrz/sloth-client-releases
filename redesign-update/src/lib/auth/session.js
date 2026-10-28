const { AuthError, flowFor, refreshMicrosoft, minecraftLogin, assertOwnership, fetchProfile, fetchSkin } = require('./microsoft');
const { browserSignIn } = require('./browser-signin');

const REFRESH_MARGIN_MS = 10 * 60 * 1000;

/**
 * Glue between the Microsoft/Minecraft token chain and the account store. The refresh token never leaves the
 * main process; the game only ever receives the short-lived Minecraft access token.
 */
class SessionManager {
  constructor(store, { openExternal, log = () => {} }) {
    this.store = store;
    this.openExternal = openExternal;
    this.log = log;
    this.pending = new Map();
    this.forced = new Map();
  }

  /** Browser sign-in. `onPrompt` receives what the UI should show (e.g. the device code). */
  async signIn(authConfig, { onPrompt, signal }) {
    const flow = flowFor(authConfig);
    const ms = await browserSignIn(flow, { openExternal: this.openExternal, onPrompt, signal });
    const mc = await minecraftLogin(flow, ms.accessToken);
    await assertOwnership(mc.accessToken);
    const profile = await fetchProfile(mc.accessToken);
    const skin = await fetchSkin(profile.skinUrl).catch(() => undefined);
    this.store.upsert({ uuid: profile.uuid, name: profile.name, skin }, {
      auth: { mode: flow.mode, clientId: flow.clientId },
      msRefresh: ms.refreshToken,
      mcToken: mc.accessToken,
      mcExpiresAt: mc.expiresAt,
      xuid: mc.xuid
    });
    this.log(`Signed in as ${profile.name}`);
    return profile;
  }

  /** Returns a launch-ready session for `uuid`, refreshing tokens when needed. Concurrent calls share one refresh. */
  launchSession(uuid) {
    if (this.forced.has(uuid)) return this.forced.get(uuid);
    if (!this.pending.has(uuid)) {
      const job = this.#refresh(uuid).finally(() => this.pending.delete(uuid));
      this.pending.set(uuid, job);
    }
    return this.pending.get(uuid);
  }

  refreshSession(uuid) {
    if (!this.forced.has(uuid)) {
      const pending = this.pending.get(uuid);
      const job = (async () => { if (pending) await pending.catch(() => {}); return this.#refresh(uuid, true); })().finally(() => this.forced.delete(uuid));
      this.forced.set(uuid, job);
    }
    return this.forced.get(uuid);
  }

  async #refresh(uuid, force = false) {
    const account = this.store.find(uuid);
    if (!account) throw new AuthError('That account is no longer signed in.', 'reauth');
    const secret = this.store.secret(uuid);
    if (!secret?.msRefresh) {
      this.store.markReauth(uuid);
      throw new AuthError(`Please sign in again as ${account.name}.`, 'reauth');
    }
    if (!force && secret.mcToken && secret.mcExpiresAt - Date.now() > REFRESH_MARGIN_MS) {
      return { name: account.name, uuid, accessToken: secret.mcToken, xuid: secret.xuid };
    }
    const flow = flowFor(secret.auth);
    try {
      const ms = await refreshMicrosoft(flow, secret.msRefresh);
      // Microsoft rotates refresh tokens: keep the new one even if the Xbox or Minecraft steps below fail.
      if (ms.refreshToken && ms.refreshToken !== secret.msRefresh) this.store.setSecret(uuid, { ...secret, msRefresh: ms.refreshToken });
      const mc = await minecraftLogin(flow, ms.accessToken);
      await assertOwnership(mc.accessToken);
      const profile = await fetchProfile(mc.accessToken);
      const skin = await fetchSkin(profile.skinUrl).catch(() => undefined);
      this.store.updateProfile(uuid, { name: profile.name, skin });
      this.store.setSecret(uuid, { ...secret, msRefresh: ms.refreshToken, mcToken: mc.accessToken, mcExpiresAt: mc.expiresAt, xuid: mc.xuid || secret.xuid });
      this.log(`Refreshed session for ${profile.name}`);
      return { name: profile.name, uuid, accessToken: mc.accessToken, xuid: mc.xuid || secret.xuid };
    } catch (err) {
      if (err instanceof AuthError && (err.code === 'reauth' || err.code === 'no-game')) this.store.markReauth(uuid);
      throw err;
    }
  }
}

module.exports = { SessionManager, AuthError };
