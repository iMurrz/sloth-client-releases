const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

let userAgent = 'SlothClient (unofficial community launcher)';
const setUserAgent = value => { userAgent = value; };

class HttpError extends Error {
  constructor(url, status, body) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const retriable = err => !(err instanceof HttpError) || err.status === 429 || err.status >= 500;

async function request(url, { method = 'GET', headers = {}, body, timeout = 30000, retries = 2, signal, redirect } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        method, body,
        headers: { 'User-Agent': userAgent, ...headers },
        redirect: method !== 'GET' || Object.keys(headers).some(k => /^(authorization|cookie|x-api-key)$/i.test(k)) ? 'error' : (redirect || 'follow'),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
      });
      if (!res.ok) throw new HttpError(url, res.status, await res.text().catch(() => ''));
      return res;
    } catch (err) {
      if (signal?.aborted || attempt >= retries || !retriable(err)) throw err;
      await sleep(600 * 2 ** attempt);
    }
  }
}

const getJson = async (url, opts) => (await request(url, opts)).json();
const getText = async (url, opts) => (await request(url, opts)).text();

async function postJson(url, payload, { headers = {}, ...opts } = {}) {
  const res = await request(url, {
    ...opts, method: 'POST', body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }
  });
  return res.json();
}

async function postForm(url, form, opts = {}) {
  const res = await request(url, {
    ...opts, method: 'POST', body: new URLSearchParams(form).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  });
  return res.json();
}

async function hashFile(file, algorithm = 'sha1') {
  const hash = crypto.createHash(algorithm);
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

/**
 * Whether `file` already satisfies `expect` ({ size, sha1, sha512 }). Size is always checked when known;
 * hashes only when `deep` is set, so routine launches stay fast and "Repair" does a full verification.
 */
async function fileMatches(file, expect, deep = false) {
  let stat;
  try { stat = await fsp.lstat(file); } catch { return false; }
  if (!stat.isFile()) return false;
  if (expect.size != null && stat.size !== expect.size) return false;
  if (!deep) return true;
  if (expect.sha512) return (await hashFile(file, 'sha512')) === expect.sha512.toLowerCase();
  if (expect.sha1) return (await hashFile(file, 'sha1')) === expect.sha1.toLowerCase();
  return true;
}

// Artifact redirects may change paths on the approved origin, never transport or authority.
async function artifactResponse(url, signal, redirectHosts) {
  const origin = new URL(url);
  const validate = target => {
    if (target.protocol !== 'https:' || target.username || target.password || target.port || (target.origin !== origin.origin && !redirectHosts?.includes(target.hostname))) {
      throw new Error('Blocked unsafe artifact download URL or redirect');
    }
  };
  let current = origin;
  for (let hop = 0; hop <= 5; hop++) {
    validate(current);
    const res = await fetch(current, { headers: { 'User-Agent': userAgent }, redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location || hop === 5) throw new Error('Invalid or excessive artifact redirects');
      current = new URL(location, current);
      continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw new HttpError(current, res.status, ''); }
    return res;
  }
}

/** Streams `url` to `dest` through a `.part` file, verifying the hash before the final rename. */
async function download(url, dest, { sha1, sha512, size, onBytes, signal, retries = 3, redirectHosts } = {}) {
  if (!/^https:\/\//i.test(url)) throw new Error(`Refusing non-HTTPS download: ${url}`);
  if (!sha1 && !sha512) throw new Error(`Refusing unverified download: ${path.basename(dest)}`);
  if (!new RegExp(sha512 ? '^[a-f0-9]{128}$' : '^[a-f0-9]{40}$', 'i').test(sha512 || sha1)) throw new Error('Invalid download checksum');
  if (size != null && (!Number.isSafeInteger(size) || size < 0 || size > 2 * 1024 ** 3)) throw new Error('Invalid download size');
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const id = crypto.randomUUID(); let lastEvent = 0;
  const controller = new AbortController();
  signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  activeDownloads.set(id, controller);
  const emit = (state, received = 0, attempt = 0, force = true) => {
    if (!force && Date.now() - lastEvent < 200) return;
    lastEvent = Date.now();
    try { downloadObserver?.({ id, name: path.basename(dest), state, received, size: size || 0, attempt, at: Date.now(), task: { url, dest, sha1, sha512, size } }); } catch { /* A display observer cannot break verified downloads. */ }
  };
  const part = `${dest}.${crypto.randomUUID()}.part`;
  try {
  for (let attempt = 0; ; attempt++) {
    let received = 0;
    emit(attempt ? 'retrying' : 'downloading', 0, attempt);
    try {
      const res = await artifactResponse(url, signal, redirectHosts);
      const hash = crypto.createHash(sha512 ? 'sha512' : 'sha1');
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          received += chunk.length;
          if (received > (size ?? 2 * 1024 ** 3)) return cb(new Error(`Download exceeds size limit for ${path.basename(dest)}`));
          hash.update(chunk);
          onBytes?.(chunk.length);
          emit('downloading', received, attempt, false);
          cb(null, chunk);
        }
      });
      await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(part, { flags: 'wx' }), { signal });
      if (size != null && received !== size) throw new Error(`Size mismatch for ${path.basename(dest)}: expected ${size}, got ${received}`);
      if (hash.digest('hex') !== (sha512 || sha1).toLowerCase()) throw new Error(`Checksum mismatch for ${path.basename(dest)}`);
      await fsp.rename(part, dest);
      emit('completed', received, attempt);
      activeDownloads.delete(id); return received;
    } catch (err) {
      onBytes?.(-received);
      await fsp.rm(part, { force: true });
      if (signal?.aborted || attempt >= retries || !retriable(err)) { emit(signal?.aborted ? 'cancelled' : 'failed', 0, attempt); activeDownloads.delete(id); throw err; }
      await sleep(800 * 2 ** attempt);
    }
  }
  } finally { activeDownloads.delete(id); }
}

/** Runs `worker` over `items` with at most `limit` in flight; the first failure aborts the rest. */
async function runPool(items, limit, worker, signal) {
  let next = 0;
  let failure;
  const lane = async () => {
    while (!failure && next < items.length) {
      if (signal?.aborted) throw signal.reason ?? new Error('Cancelled');
      const item = items[next++];
      try { await worker(item); }
      catch (err) { failure ??= err; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failure) throw failure;
}

let downloadObserver = null;
const activeDownloads = new Map();
function cancelDownload(id) { const c=activeDownloads.get(id);if(!c)throw Error('This download has already finished.');c.abort(new Error('Download cancelled. Return to the original action to resume installation.')); }
function observeDownloads(callback) { downloadObserver = callback; }
module.exports = { HttpError, setUserAgent, request, getJson, getText, postJson, postForm, download, fileMatches, hashFile, runPool, observeDownloads, cancelDownload };
