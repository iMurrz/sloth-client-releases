const dns = require('node:dns/promises');
const ENDPOINTS = [
  ['Microsoft sign-in', 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'],
  ['Minecraft metadata', 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'],
  ['Modrinth catalog', 'https://api.modrinth.com/v2/tag/category']
];
async function inspect() {
  const results = await Promise.all(ENDPOINTS.map(async ([name, url]) => {
    const start = Date.now(); const host = new URL(url).hostname;
    try {
      await Promise.race([dns.lookup(host), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('DNS timeout')), 8000); timer.unref(); })]);
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { 'User-Agent': 'SlothClient connection check', 'Cache-Control': 'no-cache' } });
      const date = Date.parse(response.headers.get('date')); const age = Number(response.headers.get('age') || 0);
      await response.body?.cancel();
      return { name, host, state: response.ok ? 'good' : 'warn', detail: `HTTP ${response.status} · ${Date.now() - start} ms`, clockWarning: name === 'Microsoft sign-in' && age < 120 && Number.isFinite(date) && Math.abs(Date.now() - date) > 300000 ? 'Your clock differs from this server response by more than five minutes. Check Windows date and time before signing in.' : null };
    } catch (e) {
      const clue = `${e.code || ''} ${e.message || ''} ${e.cause?.code || ''} ${e.cause?.message || ''}`;
      const detail = /CERT_|SELF_SIGNED|UNABLE_TO_VERIFY|certificate/i.test(clue)
        ? 'Certificate verification failed. Check system time and trusted network/proxy settings. Keep certificate verification enabled.'
        : e.message === 'DNS timeout' || /getaddrinfo|ENOTFOUND|EAI_AGAIN/.test(clue) ? 'DNS lookup failed or timed out.' : 'HTTPS connection failed or timed out. Check your connection, proxy or firewall.';
      return { name, host, state: 'error', detail };
    }
  }));
  return { checkedAt: new Date().toISOString(), results };
}
module.exports = { inspect };
