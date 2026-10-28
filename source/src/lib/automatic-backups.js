// Called only when the launcher owns the instance-operation lock and no game is running.
async function run({ recovery, manager, policy, progress, force = false, signal }) {
  if (!policy.enabled && !force) return { skipped: true, message: 'Automatic world backups are disabled.' };
  const instance = manager.get();
  const points = await recovery.list();
  const last = points.find(p => p.automatic && p.instanceId === instance.id);
  if (!force && last && Date.now() - Date.parse(last.createdAt) < policy.intervalHours * 3600000) return { skipped: true, message: 'The current instance already has a recent world backup.' };
  let id;
  try { id = await recovery.create(manager.instancePath(), instance, 'Automatic world backup', progress, { worldsOnly: true, automatic: true, maxBytes: policy.maxGb * 1024 ** 3, signal }); }
  catch (e) { if (e.code === 'NO_GAME_DATA') return { skipped: true, message: e.message }; throw e; }
  await recovery.pruneAutomatic({ keep: policy.keep, maxBytes: policy.maxGb * 1024 ** 3 });
  return { id, message: 'World backup saved. Manual restore points were preserved.' };
}
module.exports = { run };
