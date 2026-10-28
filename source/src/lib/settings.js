const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const HOLIDAYS = require('../holiday-themes').map(t=>t.id);
const { defaultModSettings, catalog } = require('./game/mods');

const ON_LAUNCH = ['minimize', 'keep', 'close'];
/** Accent themes: hue of every highlight colour in the launcher and the in-game menus. */
const ACCENTS = { pink: 330, violet: 275, ocean: 200, ember: 18 };

function defaults() {
  return {
    accent: 'pink',
    seasonalTheme: 'none',
    seasonalAnimations: true,
    seasonalIntensity: 'haunted',
    seasonalJumpscares: false,
    updateChannel: 'stable',
    memoryMb: 4096,
    onLaunch: 'minimize',
    javaPath: '',
    resolution: null,
    backups: { enabled: true, intervalHours: 24, keep: 10, maxGb: 8 },
    performancePreset: '',
    reminderMinutes: 45,
    accessibility: { textScale: 1, reduceMotion: false, highContrast: false },
    mods: defaultModSettings(),
    authMode: config.auth.mode,
    authClientId: config.auth.clientId,
    clientId: crypto.randomBytes(16).toString('base64')
  };
}

const int = value => (Number.isInteger(Number(value)) && String(value).trim() !== '' ? Number(value) : NaN);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Applies a patch, keeping only valid values. `trusted` patches come from the main process itself (e.g. the
 * native Java file picker); the renderer may only clear the Java path, never point it at an executable.
 */
function applyPatch(current, patch, { maxMemoryMb, trusted = false }) {
  const next = { ...current, mods: { ...current.mods } };
  if (patch.backups && typeof patch.backups === 'object') {
    next.backups = { ...current.backups };
    if (typeof patch.backups.enabled === 'boolean') next.backups.enabled = patch.backups.enabled;
    for (const [key, lo, hi] of [['intervalHours', 1, 168], ['keep', 1, 50], ['maxGb', 1, 100]]) {
      if (Number.isInteger(patch.backups[key])) next.backups[key] = clamp(patch.backups[key], lo, hi);
    }
  }
  if (['', 'quiet', 'balanced', 'performance', 'visual'].includes(patch.performancePreset)) next.performancePreset = patch.performancePreset;
  if ([0, 30, 45, 60, 90, 120].includes(patch.reminderMinutes)) next.reminderMinutes = patch.reminderMinutes;
  if (patch.accessibility && typeof patch.accessibility === 'object') {
    next.accessibility = { ...current.accessibility };
    if ([1, 1.15, 1.3, 1.5].includes(patch.accessibility.textScale)) next.accessibility.textScale = patch.accessibility.textScale;
    if (typeof patch.accessibility.reduceMotion === 'boolean') next.accessibility.reduceMotion = patch.accessibility.reduceMotion;
    if (typeof patch.accessibility.highContrast === 'boolean') next.accessibility.highContrast = patch.accessibility.highContrast;
  }
  if (Object.hasOwn(ACCENTS, patch.accent)) next.accent = patch.accent;
  if (HOLIDAYS.includes(patch.seasonalTheme)) next.seasonalTheme = patch.seasonalTheme;
  if (typeof patch.seasonalJumpscares === 'boolean') next.seasonalJumpscares = patch.seasonalJumpscares;
  if (typeof patch.seasonalAnimations === 'boolean') next.seasonalAnimations = patch.seasonalAnimations;
  if (['subtle', 'haunted', 'nightmare'].includes(patch.seasonalIntensity)) next.seasonalIntensity = patch.seasonalIntensity;
  if (['stable', 'preview'].includes(patch.updateChannel)) next.updateChannel = patch.updateChannel;
  if (!Number.isNaN(int(patch.memoryMb))) next.memoryMb = clamp(Math.round(int(patch.memoryMb) / 512) * 512, 2048, maxMemoryMb);
  if (ON_LAUNCH.includes(patch.onLaunch)) next.onLaunch = patch.onLaunch;
  if (patch.javaPath === '') next.javaPath = '';
  else if (trusted && typeof patch.javaPath === 'string' && path.isAbsolute(patch.javaPath) && /^javaw?(\.exe)?$/i.test(path.basename(patch.javaPath))) {
    next.javaPath = patch.javaPath;
  }
  if (patch.resolution === null) next.resolution = null;
  else if (patch.resolution && typeof patch.resolution === 'object') {
    const width = int(patch.resolution.width);
    const height = int(patch.resolution.height);
    if (!Number.isNaN(width) && !Number.isNaN(height)) next.resolution = { width: clamp(width, 640, 7680), height: clamp(height, 480, 4320) };
  }
  if (patch.mods && typeof patch.mods === 'object') {
    for (const mod of catalog()) if (typeof patch.mods[mod.slug] === 'boolean') next.mods[mod.slug] = patch.mods[mod.slug];
  }
  if (patch.authMode === 'live' || patch.authMode === 'azure') next.authMode = patch.authMode;
  if (typeof patch.authClientId === 'string' && /^[0-9a-fA-F-]{16,36}$/.test(patch.authClientId.trim())) next.authClientId = patch.authClientId.trim();
  return next;
}

class Settings {
  constructor(file, { maxMemoryMb }) {
    this.file = file;
    this.history = new (require('./settings-backups').SettingsBackups)(file);
    this.instanceId = '';
    this.maxMemoryMb = maxMemoryMb;
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
    // 0.1.x stored whole gigabytes and defaulted to the wrong port.
    if (saved.memoryGb && !saved.memoryMb) saved.memoryMb = saved.memoryGb * 1024;
    const base = defaults();
    // The settings file lives in the user's own profile, so a Java path saved there is trusted.
    this.value = applyPatch(base, saved, { maxMemoryMb, trusted: true });
    if (typeof saved.clientId === 'string' && /^[A-Za-z0-9+/=]{16,64}$/.test(saved.clientId)) this.value.clientId = saved.clientId;
    this.save();
  }

  get() { return structuredClone(this.value); }

  /** Patch from the renderer (untrusted). */
  update(patch) {
    const before = this.value;
    const next = applyPatch(before, patch && typeof patch === 'object' ? patch : {}, { maxMemoryMb: this.maxMemoryMb });
    this.history.record(before, next, this.instanceId);
    this.value = next;
    try { this.save(); } catch(e) { this.value = before; throw e; }
    return this.get();
  }

  /** Java path chosen through the main-process file picker. */
  setJavaPath(javaPath) {
    this.value = applyPatch(this.value, { javaPath }, { maxMemoryMb: this.maxMemoryMb, trusted: true });
    this.save();
    return this.get();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.value, null, 2));
    fs.renameSync(`${this.file}.tmp`, this.file);
  }
}

module.exports = { Settings, ACCENTS };
