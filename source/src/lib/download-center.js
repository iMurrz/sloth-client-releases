const path = require('node:path');
const { download, cancelDownload } = require('./http');
const tools = require('./file-tools');
class DownloadCenter {
  constructor(root, notify, activeInstance) { this.root = root; this.notify = notify; this.activeInstance = activeInstance; this.jobs = new Map(); this.timer = null; this.counts = { completed: 0, failed: 0, bytes: 0 }; }
  record(event) {
    const previous = this.jobs.get(event.id);
    const instance = previous?.instanceId || this.activeInstance();
    const base = path.resolve(this.root), dest = path.resolve(event.task.dest);
    const canRetry = dest.startsWith(base + path.sep);
    this.jobs.set(event.id, { ...event, instanceId: instance, canRetry, canCancel:['downloading','retrying'].includes(event.state) });
    if (event.state === 'completed' && previous?.state !== 'completed') { this.counts.completed++; this.counts.bytes += event.received; }
    if (event.state === 'failed' && previous?.state !== 'failed') this.counts.failed++;
    const inactive = [...this.jobs.values()].filter(j => !['downloading', 'retrying'].includes(j.state));
    while (inactive.length > 100) this.jobs.delete(inactive.shift().id);
    this.timer ||= setTimeout(() => { this.timer = null; this.notify(this.list()); }, 500).unref();
  }
  list() {
    return { counts: this.counts, jobs: [...this.jobs.values()].sort((a, b) => Number(['downloading', 'retrying'].includes(b.state)) - Number(['downloading', 'retrying'].includes(a.state)) || b.at - a.at).map(({ task, ...j }) => ({ ...j, canRetry: j.canRetry && ['failed','cancelled'].includes(j.state), percent: j.updatePercent??(j.size ? Math.min(100, Math.round(j.received / j.size * 100)) : null) })) };
  }
  async retry(id) {
    const job = this.jobs.get(id);
    if (!job || !['failed','cancelled'].includes(job.state) || !job.canRetry) throw new Error('This file is not available for retry. Restart the action that requested it.');
    if (job.instanceId !== this.activeInstance()) throw new Error('Switch to the instance that requested this download before retrying it.');
    await tools.guard(this.root, job.task.dest, true);
    job.received = await download(job.task.url, job.task.dest, job.task);
    job.state = 'retried'; this.notify(this.list()); return true;
  }
  cancel(id) { const job=this.jobs.get(id);if(!job?.canCancel)throw Error('This download is not active.');cancelDownload(id); }
  recordUpdate(p) {
    if(!['downloading','ready','development-ready','error','cancelled'].includes(p.state))return;
    const old=this.jobs.get('launcher-update');if(!old&&!p.version)return;
    this.jobs.set('launcher-update',{id:'launcher-update',name:'Sloth Client update '+(p.version||old?.version||''),version:p.version||old?.version,instanceId:'launcher',state:p.state==='downloading'?'downloading':['ready','development-ready'].includes(p.state)?'completed':p.state==='cancelled'?'cancelled':'failed',received:0,size:0,at:Date.now(),attempt:0,updatePercent:p.percent??100,canRetry:false,canCancel:p.state==='downloading'&&p.cancelable===true});this.notify(this.list());
  }
}
module.exports = { DownloadCenter };
