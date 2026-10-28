const config = require('../src/lib/config');
const review = require('../release-readiness.json');
function problems() {
  const result = [];
  if (config.auth.mode !== 'azure' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(config.auth.clientId)) result.push('Configure Sloth Client\'s own approved Microsoft application; the official launcher ID is not Sloth registration.');
  for (const [key, value] of Object.entries(review)) if (value !== true) result.push('Owner review outstanding: ' + key);
  return result;
}
function assertReady() { const pending = problems(); if (pending.length) throw new Error('Public release blocked:\n' + pending.join('\n')); }
if (require.main === module) {
  const pending = problems();
  console.log(pending.length ? pending.join('\n') : 'Owner readiness checks recorded. This is not Mojang certification.');
  if (pending.length) process.exitCode = 1;
}
module.exports = { problems, assertReady };
