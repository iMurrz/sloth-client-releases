const os = require('node:os');
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /token|secret|password|authorization|api[_-]?key|credential|cookie/i.test(key) ? '<redacted>' : scrub(item)]));
  if (typeof value !== 'string') return value;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer <redacted>')
    .replace(/((?:access[_-]?token|refresh[_-]?token|client[_-]?secret|password|api[_-]?key)["']?\s*[=:]\s*)["'][^"'\r\n]*["']/gi, '$1"<redacted>"')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<address>')
    .replace(/((?:server|host|address)\s*[=:]\s*)[^\s,;]+/gi, '$1<address>')
    .replace(/\b(?:https?|wss?):\/\/[^\s"<>]+/gi, '<url>')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '<redacted>')
    .replace(/((?:access[_-]?token|refresh[_-]?token|authorization|client[_-]?secret|api[_-]?key)\s*[=:]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1<redacted>')
    .split(os.homedir()).join('<user-folder>')
    .replace(/[A-Za-z]:[\\/][^\r\n"<>]*/g, '<local-path>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>');
}
module.exports = { scrub };
