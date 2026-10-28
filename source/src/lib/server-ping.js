const net = require('node:net');
const dns = require('node:dns').promises;

// Minecraft Server List Ping (the same request the Multiplayer screen makes).
function varInt(value) {
  const bytes = [];
  let n = value >>> 0;
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n) byte |= 0x80;
    bytes.push(byte);
  } while (n);
  return Buffer.from(bytes);
}

function readVarInt(buf, offset) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null;
    const byte = buf[offset + i];
    value |= (byte & 0x7f) << (7 * i);
    if (!(byte & 0x80)) return { value, size: i + 1 };
  }
  throw new Error('Malformed VarInt');
}

const mcString = s => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([varInt(b.length), b]); };
const packet = (id, ...parts) => { const body = Buffer.concat([varInt(id), ...parts]); return Buffer.concat([varInt(body.length), body]); };

/** Minecraft clients honour _minecraft._tcp SRV records when no port is given. */
async function resolveTarget(host, port) {
  if (port === 25565 && !net.isIP(host) && host !== 'localhost') {
    try {
      const [srv] = await dns.resolveSrv(`_minecraft._tcp.${host}`);
      if (srv) return { host: srv.name, port: srv.port };
    } catch { /* no SRV record */ }
  }
  return { host, port };
}

async function pingServer(host, port, timeout = 4000) {
  const target = await resolveTarget(host, port);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: target.host, port: target.port });
    let buffer = Buffer.alloc(0);
    let status = null;
    let pingSent = 0;
    let done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err); else resolve(value);
    };
    const timer = setTimeout(() => (status ? finish(null, { ...status, latency: null }) : finish(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' }))), timeout);

    socket.once('connect', () => {
      socket.write(packet(0x00, varInt(-1), mcString(host), Buffer.from([port >> 8, port & 0xff]), varInt(1)));
      socket.write(packet(0x00));
    });
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 1024 * 1024) return finish(new Error('Status response too large'));
      try {
        for (;;) {
          const len = readVarInt(buffer, 0);
          if (!len || buffer.length < len.size + len.value) return;
          const body = buffer.subarray(len.size, len.size + len.value);
          buffer = buffer.subarray(len.size + len.value);
          const id = readVarInt(body, 0);
          if (!status && id.value === 0x00) {
            const strLen = readVarInt(body, id.size);
            status = JSON.parse(body.subarray(id.size + strLen.size, id.size + strLen.size + strLen.value).toString('utf8'));
            pingSent = Date.now();
            const payload = Buffer.alloc(8);
            payload.writeBigInt64BE(BigInt(pingSent));
            socket.write(packet(0x01, payload));
          } else if (status && id.value === 0x01) {
            return finish(null, { ...status, latency: Date.now() - pingSent });
          }
        }
      } catch (err) {
        finish(err);
      }
    });
    socket.once('error', err => finish(err));
    socket.once('close', () => (status ? finish(null, { ...status, latency: null }) : finish(new Error('Connection closed'))));
  });
}

// ---- MOTD → safe styled segments (rendered with textContent in the UI) ----
const LEGACY = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff'
};
const NAMED = {
  black: '0', dark_blue: '1', dark_green: '2', dark_aqua: '3', dark_red: '4', dark_purple: '5', gold: '6', gray: '7',
  dark_gray: '8', blue: '9', green: 'a', aqua: 'b', red: 'c', light_purple: 'd', yellow: 'e', white: 'f'
};

function colorOf(value) {
  if (typeof value !== 'string') return undefined;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  return LEGACY[NAMED[value]];
}

function pushLegacy(out, text, base) {
  let style = { ...base };
  for (const [i, part] of text.split('§').entries()) {
    let chunk = part;
    if (i > 0) {
      const code = part[0]?.toLowerCase();
      chunk = part.slice(1);
      if (LEGACY[code]) style = { color: LEGACY[code] };
      else if (code === 'l') style = { ...style, bold: true };
      else if (code === 'o') style = { ...style, italic: true };
      else if (code === 'n') style = { ...style, underline: true };
      else if (code === 'm') style = { ...style, strike: true };
      else if (code === 'r') style = {};
    }
    if (chunk) out.push({ text: chunk.slice(0, 200), ...style });
  }
}

function motdSegments(description) {
  const out = [];
  const walk = (node, inherited) => {
    if (out.length > 80 || node == null) return;
    if (typeof node === 'string') return pushLegacy(out, node, inherited);
    if (Array.isArray(node)) return node.forEach(n => walk(n, inherited));
    const style = { ...inherited };
    if (colorOf(node.color)) style.color = colorOf(node.color);
    for (const key of ['bold', 'italic', 'underline']) if (typeof node[key] === 'boolean') style[key] = node[key];
    if (typeof node.strikethrough === 'boolean') style.strike = node.strikethrough;
    if (typeof node.text === 'string') pushLegacy(out, node.text, style);
    if (Array.isArray(node.extra)) node.extra.forEach(n => walk(n, style));
  };
  walk(description, {});
  return out;
}

/** Friendly status object for the UI. Never throws. */
async function serverStatus(host, port) {
  try {
    const status = await pingServer(host, port);
    const favicon = typeof status.favicon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(status.favicon) && status.favicon.length < 200000 ? status.favicon : null;
    return {
      online: true,
      players: { online: Number(status.players?.online) || 0, max: Number(status.players?.max) || 0 },
      version: typeof status.version?.name === 'string' ? status.version.name.slice(0, 64) : null,
      motd: motdSegments(status.description),
      favicon,
      latency: status.latency
    };
  } catch (err) {
    const detail = err.code === 'ECONNREFUSED' ? 'Server is not accepting connections'
      : err.code === 'ENOTFOUND' ? 'Server address not found'
      : err.code === 'ETIMEDOUT' ? 'Connection timed out'
      : 'Could not reach the server';
    return { online: false, detail };
  }
}

module.exports = { serverStatus, pingServer, motdSegments };
