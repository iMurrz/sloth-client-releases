const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const semver = require('semver');
const { importLunarSettings } = require('./lunar-settings-import');

function runPendingSettingsImport(gameRoot, version) {
  const pending = path.join(gameRoot, 'pending-lunar-settings-import.json');
  if (!fs.existsSync(pending)) return null;
  for (const file of [gameRoot,pending]) if (fs.lstatSync(file).isSymbolicLink()) throw Error('Linked import requests are unsupported.');
  if (fs.statSync(pending).size > 2048) throw Error('Invalid settings import request.');
  const request = JSON.parse(fs.readFileSync(pending,'utf8'));
  if (request.schema !== 1 || request.source !== 'lunar' || request.instanceId !== 'sloth' || request.minimumVersion !== '0.0.8') throw Error('Unsupported settings import request.');
  if (!semver.gte(version, request.minimumVersion)) return null;
  if (process.platform !== 'win32') throw Error('Queued settings import is currently supported on Windows.');
  // Only return a process count: never expose Minecraft command lines or credentials.
  const running = execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^javaw?\\.exe$' -and $_.CommandLine -match 'TokenWrapper|KnotClient|net.minecraft.client.main.Main' }).Count"],{encoding:'utf8',timeout:15000,windowsHide:true}).trim();
  if (!/^\d+$/.test(running)) throw Error('Could not check whether Minecraft is closed.');
  if (Number(running)>0) return { deferred: true };
  // The backup stores the full report; the receipt and queue contain no account data.
  const receipt=path.join(gameRoot,'completed-lunar-settings-import.json');
  if (fs.existsSync(receipt) && fs.lstatSync(receipt).isSymbolicLink()) throw Error('Linked import receipt is unsupported.');
  const report=importLunarSettings(path.join(gameRoot,'instances','sloth'));
  fs.writeFileSync(receipt,JSON.stringify({schema:1,version,completedAt:new Date().toISOString(),backup:report.backup}));
  fs.unlinkSync(pending);
  return report;
}
module.exports={ runPendingSettingsImport };
