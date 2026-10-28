const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

// A local, owner-requested change. No request is included in public installers.
function applyPendingControls(root) {
  const pending = path.join(root, 'pending-controls.json');
  if (!fs.existsSync(pending)) return null;
  const guard = file => {
    for (let p = file; ; p = path.dirname(p)) {
      if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw Error('Linked control settings are unsupported.');
      if (p === path.dirname(root)) break;
    }
  };
  guard(pending);
  if (fs.statSync(pending).size > 2048) throw Error('Oversized control request.');
  const request = JSON.parse(fs.readFileSync(pending, 'utf8'));
  if (request.schema !== 1 || request.instanceId !== 'sloth' || request.freelook !== 'left-alt-hold') throw Error('Unsupported control request.');
  if (process.platform !== 'win32') return { deferred: true };
  const count = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^javaw?\\.exe$' -and $_.CommandLine -match 'TokenWrapper|KnotClient|net.minecraft.client.main.Main' }).Count"], { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim();
  if (!/^\d+$/.test(count) || Number(count)) return { deferred: true };
  const instance = path.join(root, 'instances', request.instanceId);
  const modules = path.join(instance, 'config', 'sloth-client', 'modules.json');
  const options = path.join(instance, 'options.txt');
  for (const file of [modules, options]) {
    guard(file);
    if (!fs.existsSync(file) || fs.statSync(file).size > 1024 * 1024) throw Error('Control settings unavailable or oversized.');
  }
  const value = JSON.parse(fs.readFileSync(modules, 'utf8'));
  if (!value.modules || typeof value.modules !== 'object' || Array.isArray(value.modules)) throw Error('Invalid module settings.');
  value.modules.freelook = { ...(value.modules.freelook || {}), enabled: true, settings: { ...(value.modules.freelook?.settings || {}), mode: 'Hold' } };
  let text = fs.readFileSync(options, 'utf8');
  const key = 'key_key.sloth-client.freelook:key.keyboard.left.alt';
  text = /^key_key\.sloth-client\.freelook:.*$/m.test(text) ? text.replace(/^key_key\.sloth-client\.freelook:.*$/m, key) : text + '\n' + key + '\n';
  const changes = [[modules, JSON.stringify(value, null, 2)], [options, text]];
  const originals = changes.map(([file]) => fs.readFileSync(file));
  const stamp = Date.now();
  for (const [file] of changes) fs.copyFileSync(file, `${file}.before-controls-${stamp}`, fs.constants.COPYFILE_EXCL);
  const temporaryFiles = [];
  try {
    for (const [file, content] of changes) {
      const temp = `${file}.controls-${randomUUID()}`;
      guard(temp);
      temporaryFiles.push(temp);
      fs.writeFileSync(temp, content, { flag: 'wx' });
      fs.renameSync(temp, file);
    }
    fs.unlinkSync(pending);
  } catch (error) {
    changes.forEach(([file], i) => fs.writeFileSync(file, originals[i]));
    throw error;
  } finally {
    for (const temp of temporaryFiles) if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return { applied: true };
}
module.exports = { applyPendingControls };
