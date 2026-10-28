const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
const api = window.sloth;
let rendererStartupFault=false;
window.addEventListener('error',()=>{rendererStartupFault=true;});

const state = {
  settings: null,
  accounts: [],
  catalog: [],
  memory: { maxMb: 8192 },
  game: { running: false, busy: false },
  server: null,
  lastProgress: null,
  gameVersion: '',
  requiredMods: [],
  instances: [],
  activeInstanceId: 'sloth'
};
state.savedProjects = [];

// ---------- small helpers ----------
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function toast(message, { error = false } = {}) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.toggle('error', error);
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), error ? 6000 : 3000);
}

const gb = mb => `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB`;
const mb = bytes => `${(bytes / 1e6).toFixed(bytes > 1e8 ? 0 : 1)} MB`;

// Session Seal reviews are scoped to an instance and rechecked by the main process.
let sealPlan=null, sealOffset=0, sealBusy=false, trustGeneration=0;
function sealStatus(text){$('#seal-status').textContent=text;}
function sealControls(){for(const id of ['seal-review','seal-approve','seal-disable','seal-protect'])$(`#${id}`).disabled=sealBusy;}
async function loadTrustCenter(){
  const generation=++trustGeneration;sealPlan=null;$('#seal-review-content').hidden=true;sealOffset=0;
  try {
    const data=await api.trustStatus();if(generation!==trustGeneration||data.instanceId!==state.activeInstanceId)return;
    $('#trust-instance').textContent=data.instanceName;
    $('#trust-seal-summary').textContent=data.sealError||(!data.seal.enrolled?'No reviewed seal yet. Inspect your prepared setup to create one.':`${data.seal.protect?'Launch protection enabled':'Launch protection off'} · ${data.seal.count} approved ${data.seal.count===1?'file':'files'} · ${new Date(data.seal.at).toLocaleString()}`);
    $('#trust-fingerprint').textContent=data.seal.fingerprint||'No seal yet';
    const cards=[
      ['Credential storage',data.encryptionAvailable?'Secure OS storage available':'Memory-only sign-in; secure storage unavailable'],
      ['Interface isolation',data.sandbox&&data.isolated&&data.nodeDisabled?'Sandbox and isolation enabled; Node access disabled':'Isolation settings need review'],
      ['Signed update pipeline','Installers require SHA-512 and the Sloth Ed25519 signature'],
      ['Local review',`${data.packaged?'Packaged client':'Development build'} ${data.version} · seals remain in this instance`]
    ];
    $('#trust-boundaries').replaceChildren(...cards.map(([title,detail])=>el('article',{class:'panel trust-card'},[el('h3',{text:title}),el('p',{class:'field-help',text:detail})])));
  }catch(e){$('#trust-seal-summary').textContent=e.message;}
}
function renderSealFiles(){
  if(!sealPlan)return;
  const kinds=new Map(sealPlan.changes.map(c=>[c.name,c.kind]));
  const removed=sealPlan.changes.filter(c=>c.kind==='removed').map(c=>({...c,sha256:'Previously approved file removed'}));
  const files=[...sealPlan.files,...removed];sealOffset=Math.min(sealOffset,Math.max(0,Math.floor((files.length-1)/50)*50));
  $('#seal-files').replaceChildren(...files.slice(sealOffset,sealOffset+50).map(file=>el('article',{class:'seal-file'},[
    el('div',{},[el('strong',{text:file.name}),el('span',{class:'seal-change',text:kinds.get(file.name)||'unchanged'})]),
    el('code',{text:file.sha256})
  ])));
  $('#seal-file-page').textContent=files.length?`${sealOffset+1}–${Math.min(files.length,sealOffset+50)} of ${files.length}`:'No mod/script files found. Prepare Minecraft first; an empty seal will pause launch when mods are installed.';
  $('#seal-previous').disabled=sealOffset===0;$('#seal-next').disabled=sealOffset+50>=files.length;
}
$('#seal-previous').addEventListener('click',()=>{sealOffset=Math.max(0,sealOffset-50);renderSealFiles();});
$('#seal-next').addEventListener('click',()=>{sealOffset+=50;renderSealFiles();});
$('#seal-review').addEventListener('click',async()=>{
  if(sealBusy)return;sealBusy=true;sealControls();sealPlan=null;$('#seal-review-content').hidden=true;sealStatus('Hashing your installed mods and script folders. Nothing is uploaded…');
  try {
    const plan=await api.sealReview();if(plan.instanceId!==state.activeInstanceId)throw Error('The active instance changed. Inspect again.');
    sealPlan=plan;sealOffset=0;$('#seal-protect').checked=true;
    $('#seal-review-summary').replaceChildren(el('h3',{text:`${plan.files.length} files · ${mb(plan.bytes)} · ${plan.changes.length} differences`}),el('code',{text:plan.fingerprint}));
    $('#seal-review-content').hidden=false;renderSealFiles();sealStatus(plan.warning||'Review the file origins and changes, then approve only the setup you intend to run.');
  }catch(e){sealStatus(e.message);}finally{sealBusy=false;sealControls();}
});
$('#seal-approve').addEventListener('click',async()=>{
  if(sealBusy)return;if(!sealPlan||sealPlan.instanceId!==state.activeInstanceId){sealStatus('Inspect this instance again before approving.');return;}
  if(!confirm('Approve the listed files as your baseline? Approval records your choice; it does not certify that these mods or scripts are safe.'))return;
  sealBusy=true;sealControls();sealStatus('Rechecking reviewed files before approval…');
  try{await api.sealApprove({token:sealPlan.token,protect:$('#seal-protect').checked});await loadTrustCenter();sealStatus('Reviewed setup sealed locally. Intentional updates may require a new review.');}
  catch(e){sealPlan=null;$('#seal-review-content').hidden=true;sealStatus(e.message);}
  finally{sealBusy=false;sealControls();}
});
$('#seal-disable').addEventListener('click',async()=>{
  if(sealBusy||!confirm('Disable Session Seal launch protection for this instance? Your mods and scripts stay in place. A damaged seal is preserved in a local backup.'))return;
  sealBusy=true;sealControls();
  try{await api.sealDisable({instanceId:state.activeInstanceId});await loadTrustCenter();sealStatus('Launch protection disabled for this instance.');}
  catch(e){sealStatus(e.message);}finally{sealBusy=false;sealControls();}
});

// ---------- local mod manager and launch journal ----------
let modReport = null, modRead = 0, modChanging = false;
async function loadModManager() {
  const read = ++modRead, instanceId = state.activeInstanceId;
  modReport = null;
  $('#mods-summary').textContent = 'Inspecting your instance…';
  $('#mods-results').replaceChildren();
  try {
    const report = await api.modsInspect();
    if (read !== modRead || instanceId !== state.activeInstanceId) return;
    modReport = report;
    renderModManager();
  } catch (error) { if (read === modRead) { $('#mods-summary').textContent = 'Could not inspect mods'; toast(error.message, { error: true }); } }
}
function renderModManager() {
  if (!modReport) return;
  const query = $('#mods-search').value.toLowerCase().trim(), filter = $('#mods-filter').value;
  $('#mods-summary').textContent = `${modReport.enabled} enabled · ${modReport.disabled} disabled · ${modReport.issues} notices · ${modReport.compatibility?.unresolved||0} unresolved requirements${modReport.compatibility?.truncated?' · inspection limited to 1,000 files':''}`;
  $('#mods-note').textContent = modReport.note;
  const rows = modReport.mods.filter(mod => `${mod.name} ${mod.id || ''} ${mod.filename}`.toLowerCase().includes(query) && (filter === 'all' || filter === 'personal' && !mod.managed || filter === 'managed' && mod.managed || filter === 'enabled' && mod.enabled || filter === 'disabled' && !mod.enabled || filter === 'issues' && (mod.issues.length||mod.dependencyNotices?.length)));
  const target = $('#mods-results'); target.replaceChildren();
  if (!rows.length) target.append(el('p', { class: 'field-help', text: 'No mods match. Add compatible Fabric mods using Browse Mods or your mods folder.' }));
  for (const mod of rows) {
    const details = el('div', { class: 'managed-mod-details' }, [el('b', { text: mod.id === 'sloth-client' ? 'Sloth Client' : mod.name }), el('p', { class: 'field-help', text: `${mod.id === 'sloth-client' ? 'Sloth Client' : mod.id || 'Unknown ID'} ${mod.version} · ${mb(mod.size)} · ${mod.managed ? 'Launcher pack' : mod.source} · ${mod.enabled ? 'Enabled' : 'Disabled'}` }), el('code', { text: mod.filename })]);
    const compatibility=mod.compatibility||{state:'review',label:'Needs review'};details.prepend(el('span',{class:'compatibility-label compatibility-'+compatibility.state,text:compatibility.label,title:compatibility.detail||'Top-level metadata checks; game startup makes the final compatibility decision.'}));
    for (const issue of mod.issues) details.append(el('p', { class: 'mod-notice', text: issue }));
    if(mod.dependencyNotices?.length)details.append(el('p',{class:'field-help',text:mod.dependencyNotices.length+' dependency checks need review. Expand dependency details for missing requirements, version mismatches, or incomplete inspection.'}));
    if(mod.dependencies?.length||mod.requiredBy?.length) details.append(el('details',{},[el('summary',{text:'Dependencies and change impact'}),el('p',{class:'field-help',text:mod.disablePreview}),...mod.dependencies.map(d=>el('p',{class:'field-help',text:`${d.name} ${d.range} · ${d.state==='unresolved'?'Inspection incomplete; may be supplied by a nested library':d.state==='missing'?'Required dependency not found':d.state==='mismatch'?'Installed version does not match':d.state}`}))]));
    const actions = el('div', { class: 'managed-mod-actions' });
    const hash = el('button', { class: 'tool-button', text: 'File fingerprint', onclick: async () => {
      hash.disabled = true;
      try { const digest = await api.modsFingerprint(mod.filename); details.append(el('p', { class: 'mod-fingerprint', text: `SHA-256: ${digest}` })); hash.hidden = true; }
      catch (error) { toast(error.message, { error: true }); } finally { hash.disabled = false; }
    } });
    actions.append(hash);
    if (!mod.managed) {
      const toggle = el('button', { class: 'tool-button', text: mod.enabled ? 'Disable' : 'Enable', onclick: async () => {
        if (modChanging) return;
        if(!mod.enabled&&mod.dependencies?.some(d=>['unresolved','mismatch'].includes(d.state))&&!confirm('This mod has dependency notices. Enable it anyway? Fabric checks the complete dependency graph at launch.'))return;
        if(mod.enabled&&!confirm(`Disable ${mod.name}? ${mod.disablePreview||'Review dependent mods before disabling.'}`))return;
        modChanging = true; toggle.disabled = true;
        try { modReport = await api.modsToggle({ filename: mod.filename, enabled: !mod.enabled }); renderModManager(); toast(`${mod.name} ${mod.enabled ? 'disabled' : 'enabled'}.`); }
        catch (error) { toast(error.message, { error: true }); } finally { modChanging = false; toggle.disabled = false; }
      } });
      actions.append(toggle);
    } else actions.append(el('button', { class: 'tool-button', text: 'Pack settings', onclick: () => showPage('client') }));
    target.append(el('article', { class: `managed-mod-row${mod.issues.length ? ' has-notice' : ''}` }, [details, actions]));
  }
}
$('#mods-refresh').addEventListener('click', loadModManager);
$('#mods-search').addEventListener('input', renderModManager);
$('#mods-filter').addEventListener('change', renderModManager);
$('#mods-import').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    const result = await api.modsImport();
    if (!result) return;
    await loadModManager();
    $('#mods-import-report').replaceChildren();
    for (const file of result.skipped) $('#mods-import-report').append(el('p', { class: 'mod-notice', text: `${file.filename}: ${file.reason}` }));
    toast(`${result.imported.length} mod files imported${result.skipped.length ? `; ${result.skipped.length} skipped` : ''}.`);
  } catch (error) { toast(error.message, { error: true }); } finally { button.disabled = false; }
});
let historyRead = 0;
async function loadLaunchHistory() {
  const read = ++historyRead, target = $('#history-results');
  try {
    const sessions = await api.launchHistory();
    if (read !== historyRead) return;
    target.replaceChildren();
    if (!sessions.length) target.append(el('p', { class: 'field-help', text: 'Your next Minecraft launch will appear here.' }));
    for (const item of sessions) {
      const duration = item.durationSeconds == null ? 'Duration unavailable' : `${Math.floor(item.durationSeconds / 60)}m ${item.durationSeconds % 60}s`;
      target.append(el('article', { class: 'managed-mod-row' }, [el('div', {}, [el('b', { text: item.instanceName }), el('p', { class: 'field-help', text: `${new Date(item.startedAt).toLocaleString()} · Minecraft ${item.gameVersion} · ${gb(item.memoryMb)} · ${duration}${item.exitCode == null ? '' : ` · Exit ${item.exitCode}`}` })]), el('span', { class: 'session-status', text: item.status })]));
    }
  } catch (error) { toast(error.message, { error: true }); }
}
$('#history-refresh').addEventListener('click', loadLaunchHistory);
$('#support-export').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try { await previewSupportReport(); }
  catch (error) { toast(error.message, { error: true }); } finally { button.disabled = false; }
});

// ---------- navigation ----------
async function renderUserMods() {
  const mods = await api.userMods().catch(() => []);
  $('#user-mods').hidden = mods.length === 0;
  $('#user-mod-names').textContent = mods.join('  ·  ');
}

function showPage(name) {
  if (name === 'friends') loadFriends();
  if (name === 'experience') loadExperience();
  if (name === 'appearance') { $('#section-name').textContent = 'ACCOUNT APPEARANCE'; loadAppearance(); }
  if (name === 'mods') loadModManager();
  if (name === 'history') {loadLaunchHistory();loadStartupTimeline();}
  if (name === 'workshop') {loadStudio();loadSessionPlanner();}
  if (name === 'care') loadCare();
  if (name === 'updates') loadLauncherRecovery();
  if (name === 'saved') loadSavedShelf();
  if (name === 'home') { loadSessionInsights(); loadReadiness(); }

  if (name === 'downloads') loadDownloads();
  if (name === 'toolbox') loadToolbox();
  if (name === 'recovery') loadRecovery();
  if (name === 'client') renderUserMods();
  $$('.page').forEach(page => page.classList.toggle('active', page.id === `page-${name}`));
  document.body.classList.toggle('content-browser', name === 'browse');
  const downloadPages = ['downloads', 'instances', 'browse', 'mods', 'packs', 'saved'];
  const inDownloads = downloadPages.includes(name);
  const toolboxPages = ['toolbox', 'care', 'trust', 'recovery', 'experience', 'workshop', 'client', 'history', 'log'];
  const inToolbox = toolboxPages.includes(name);
  const inStudio = ['experience', 'workshop'].includes(name);
  $('#studio-workspace-header').hidden = true;
  $('#toolbox-workspace-header').hidden = !['care','trust','recovery'].includes(name);
  const inAccount=['appearance','friends','shots'].includes(name);
  $('#account-workspace-header').hidden=!inAccount;
  $('#account-workspace-header').querySelectorAll('[data-go]').forEach(button=>{const selected=button.dataset.go===name;button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  $('#download-crumb-link').textContent = inToolbox ? 'Help' : 'Downloads';
  $('#download-crumb-link').dataset.center = inToolbox ? 'toolbox' : 'downloads';
  $('#download-workspace-header').hidden = !inDownloads;
  $('#download-crumb').hidden = !(inDownloads || inToolbox || inStudio) || name === 'toolbox' || name === 'downloads';
  $('#download-instance-label').textContent = state.instances.find(i => i.id === state.activeInstanceId)?.name || 'Active instance';
  $$('[data-download-page]').forEach(tab => {
    const selected = tab.dataset.downloadPage === name;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
  });
  $$('[data-toolbox-page]').forEach(tab => {
    const selected = tab.dataset.toolboxPage === name;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
  });
  $$('[data-studio-page]').forEach(tab => {
    const selected = tab.dataset.studioPage === name;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
  });
  $$('.nav-item').forEach(item => {
    const selected = item.dataset.page === name || (inDownloads && item.dataset.page === 'downloads') || (inToolbox && item.dataset.page === 'toolbox') || (inAccount && item.dataset.page === 'appearance');
    item.classList.toggle('active', selected);
    if (selected) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
  $('#section-name').textContent = { home: 'HOME', packs: 'MODPACK LIBRARY', mods: 'MOD MANAGER', history: 'LAUNCH HISTORY', updates: 'UPDATE CLIENT', workshop: 'SETUP STUDIO', recovery: 'RECOVERY', instances: 'INSTANCES', client: 'SLOTH CLIENT', friends: 'FRIENDS', browse: 'BROWSE MODS', shots: 'SCREENSHOTS', settings: 'SETTINGS', log: 'GAME LOG' }[name];
  if (name === 'instances') renderInstances();
  if (name === 'trust') { $('#section-name').textContent='TRUST CENTER'; loadTrustCenter(); }
  if (name === 'care') $('#section-name').textContent = 'GAME CARE';
  if (name === 'experience') $('#section-name').textContent = 'CLIENT STUDIO';
  if (name === 'appearance') $('#section-name').textContent = 'ACCOUNT APPEARANCE';
  if (inDownloads) $('#section-name').textContent = { downloads: 'Downloads', instances:'My games', browse: 'Find mods', mods: 'Installed mods', packs: 'Modpacks', saved: 'Saved downloads' }[name];
  if (inStudio) $('#section-name').textContent = name === 'workshop' ? 'Setup Studio' : 'Client Tools';
  if (['toolbox','care','trust','recovery'].includes(name)) $('#section-name').textContent = { toolbox: 'Help', care: 'Repair', trust: 'Security', recovery: 'Backups' }[name];
  if(name==='home')$('#section-name').textContent='Play';
  if (name === 'log') { $('#log-dot').hidden = true; scrollLog(true); }
  if (name === 'browse' && !browse.loaded) browseSearch(true);
  if (name === 'shots') loadShots();
  if (name === 'settings') loadImportSources();
}
$$('.nav-item').forEach(item => { item.title = item.textContent.trim(); item.setAttribute('aria-label', item.textContent.trim()); item.addEventListener('click', () => showPage(item.dataset.page)); });
$('#download-crumb-link').addEventListener('click', () => showPage($('#download-crumb-link').dataset.center || 'downloads'));
for (const selector of ['[data-download-page]', '[data-toolbox-page]', '[data-studio-page]']) {
  const tabs = $$(selector);
  const pageOf = tab => tab.dataset.downloadPage || tab.dataset.toolboxPage || tab.dataset.studioPage;
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showPage(pageOf(tab)));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); showPage(pageOf(tabs[next])); tabs[next].focus(); }
    });
  });
}
$$('[data-go]').forEach(item => item.addEventListener('click', () => showPage(item.dataset.go)));

let friendsData = { friends: [], observing: false }, friendsLoading = false, officialFriendsAccount = null;
$('#minecraft-friends-refresh').addEventListener('click',async()=>{
  const button=$('#minecraft-friends-refresh'); button.disabled=true; $('#minecraft-friends-list').replaceChildren();
  try {
    const account=state.accounts.find(x=>x.active); if(!account)throw new Error('Select a signed-in Minecraft account first.');
    $('#minecraft-friends-status').textContent='Loading from Minecraft Services…';
    const data=await api.minecraftFriends({uuid:account.uuid});
    if(state.accounts.find(x=>x.active)?.uuid!==data.uuid)throw new Error('Account changed. Load again.');
    officialFriendsAccount=data.uuid;
    $('#minecraft-friends-status').textContent=`${data.friends.length} friends · ${data.incoming.length} incoming requests · ${data.outgoing.length} outgoing requests. ${data.warning||'Activity respects Minecraft privacy settings.'}`;
    $('#minecraft-friends-list').replaceChildren(...data.friends.map(friend=>el('article',{class:'friend-card'},[el('div',{},[el('strong',{text:friend.name}),el('p',{class:'field-help',text:friend.status})])])));
  }catch(error){$('#minecraft-friends-status').textContent=error.message;}finally{button.disabled=false;}
});
function renderFriends() {
  const query = $('#friends-search').value.trim().toLowerCase();
  const visible = friendsData.friends.filter(friend => friend.name.toLowerCase().includes(query) && (!$('#friends-active').checked || friend.active));
  $('#friends-count').textContent = `${friendsData.friends.filter(x => x.active).length} active · ${friendsData.friends.length} saved`;
  $('#friends-status').textContent = friendsData.observing ? `Watching your current server · ${friendsData.instanceName}. Names are reported by that server.` : 'Activity unavailable. Join a multiplayer server with the Sloth client mod. Players on other servers cannot be detected here.';
  $('#friends-list').replaceChildren(...visible.map(friend => el('article', { class: 'friend-card' }, [
    el('div', { class: `friend-avatar${friend.active ? ' is-active' : ''}`, text: friend.name.slice(0, 2).toUpperCase() }),
    el('div', {}, [el('strong', { text: friend.name }), el('p', { class: 'field-help', text: friend.active ? 'Active on your server' : friendsData.observing ? 'Not visible on this server' : 'Activity unknown' })]),
    el('button', { class: 'tool-button', text: friend.favorite ? '★' : '☆', 'aria-label': `Favorite ${friend.name}`, onclick: () => changeFriend({ action: 'favorite', name: friend.name }) }),
    el('button', { class: 'tool-button', text: 'Remove', onclick: () => changeFriend({ action: 'remove', name: friend.name }) })
  ])));
  if (!visible.length) $('#friends-list').append(el('p', { class: 'field-help', text: friendsData.friends.length ? 'No friends match your filters.' : 'Add a username to start your circle. Favorites stay near the top.' }));
}
async function loadFriends() {
  if (friendsLoading) return;
  friendsLoading = true;
  try { friendsData = await api.friendsList(); renderFriends(); } catch (error) { $('#friends-status').textContent = error.message; }
  finally { friendsLoading = false; }
}
async function changeFriend(request) {
  try { await api.friendsChange(request); if (request.action === 'add') $('#friends-add-name').value = ''; await loadFriends(); } catch (error) { toast(error.message, { error: true }); }
}
$('#friends-add').addEventListener('click', () => changeFriend({ action: 'add', name: $('#friends-add-name').value.trim() }));
$('#friends-add-name').addEventListener('keydown', event => { if (event.key === 'Enter') $('#friends-add').click(); });
$('#friends-search').addEventListener('input', renderFriends);
$('#friends-active').addEventListener('change', renderFriends);
$('#friends-refresh').addEventListener('click', loadFriends);
setInterval(() => { if ($('#page-friends').classList.contains('active') && !document.hidden && document.hasFocus() && !state.game.running) loadFriends(); }, 4000);

function renderInstances() {
  if(state.settings)loadReadiness();
  const grid = $('#instance-grid');
  if (!grid) return;
  grid.replaceChildren();
  const activeInstance = state.instances.find(i => i.id === state.activeInstanceId);
  $('#active-instance-label').textContent = activeInstance?.name || 'Sloth';
  $('#pack-instance-note').hidden = !activeInstance?.pack;
  const query = $('#instance-search').value.toLowerCase().trim();
  const visible = state.instances.filter(i => `${i.name} ${(i.tags || []).join(' ')} ${i.notes || ''}`.toLowerCase().includes(query) && (!$('#instance-favorites').checked || i.favorite)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  if (!visible.length) grid.append(el('p', { class: 'field-help', text: 'No instances match these filters.' }));
  for (const instance of visible) {
    const active = instance.id === state.activeInstanceId;
    const created = new Date(instance.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const switchProps = { class: active ? 'tool-button' : 'save-button', text: active ? 'CURRENT PROFILE' : 'SWITCH TO THIS', onclick: () => selectInstance(instance.id) };
    if (active || state.game.running || state.game.busy) switchProps.disabled = true;
    const card = el('article', { class: `instance-card panel${active ? ' active' : ''}` }, [
      el('div', { class: 'instance-card-head' }, [
        el('div', { class: 'instance-glyph', text: active ? '✦' : '◈' }),
        el('span', { class: `instance-badge${active ? ' current' : ''}`, text: active ? 'ACTIVE' : 'READY' })
      ]),
      el('h2', { text: instance.name }),
      el('div', { class: 'browse-tags' }, (instance.tags || []).map(t => el('span', { text: t }))),
      el('p', { class: 'instance-meta', text: `MINECRAFT ${instance.gameVersion} · ${instance.pack ? 'MODPACK' : 'FABRIC'}` }),
      el('p', { class: 'instance-meta', text: `Created ${created}` }),
      el('div', { class: 'instance-tools' }, [
        el('button', { class: 'tool-button', text: instance.favorite ? '★ FAVOURITE' : '☆ FAVOURITE', 'aria-pressed': String(instance.favorite), onclick: async () => {
          try { state.instances = await api.editInstance({ id: instance.id, favorite: !instance.favorite }); renderInstances(); } catch (err) { toast(err.message, { error: true }); }
        } }),
        el('button', { class: 'tool-button', text: 'RENAME', onclick: () => openRename(instance) })
      ]),
      el('div', { class: 'instance-card-foot' }, [
        el('span', { class: 'instance-separation', text: 'SEPARATE WORLDS & SETTINGS' }),
        el('button', switchProps)
      ])
    ]);
    grid.append(card);
  }
}

async function selectInstance(id) {
  try {
    const result = await api.selectInstance(id);
    state.instances = result.instances;
    state.activeInstanceId = result.activeInstanceId;
    fillSettings(result.settings);
    renderInstances();
    toast(`Switched to ${state.instances.find(i => i.id === id)?.name || 'instance'}.`);
  } catch (err) { toast(err.message, { error: true }); }
}

$('#instance-search').addEventListener('input', renderInstances);
$('#instance-favorites').addEventListener('change', renderInstances);
let renameId = null;
function openRename(instance) {
  renameId = instance.id;
  $('#rename-name').value = instance.name;
  $('#rename-modal').hidden = false;
  $('#rename-name').focus();
  $('#rename-name').select();
}
function closeRename() { $('#rename-modal').hidden = true; $('#instance-search').focus(); }
$('#rename-cancel').addEventListener('click', closeRename);
$('#rename-modal').addEventListener('click', event => { if (event.target === $('#rename-modal')) closeRename(); });
$('#rename-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { state.instances = await api.editInstance({ id: renameId, name: $('#rename-name').value }); renderInstances(); closeRename(); toast('Instance renamed.'); }
  catch (err) { toast(err.message, { error: true }); }
});
$('#instance-testing').addEventListener('click', async event => {
  event.target.disabled = true;
  toast('Copying your setup for mod testing. Large worlds may take a while.');
  try {
    const result = await api.testingInstance();
    state.instances = result.instances;
    state.activeInstanceId = result.activeInstanceId;
    fillSettings(result.settings);
    renderInstances();
    toast('Testing copy selected. Player-added mods are disabled in this copy.');
  } catch (err) { toast(err.message, { error: true }); }
  finally { event.target.disabled = false; }
});

let studioRequest = 0;
async function loadStudio() {
  const request = ++studioRequest;
  $('#studio-status').textContent = 'Scanning the active instance…';
  try {
    const report = await api.workshopInspect();
    if (request !== studioRequest) return;
    $('#studio-total').textContent = mb(report.totalBytes);
    $('#studio-status').textContent = `Setup report for ${state.instances.find(i => i.id === state.activeInstanceId)?.name || 'Sloth'}. This is a configuration check, not an FPS benchmark.`;
    $('#studio-checks').replaceChildren(...report.checks.map(check => el('article', { class: `panel studio-check ${check.level}` }, [el('span', { class: 'instance-badge', text: check.level === 'warn' ? 'REVIEW' : check.level === 'good' ? 'READY' : 'INFO' }), el('h3', { text: check.title }), el('p', { text: check.detail })])));
    const largest = Math.max(1, ...report.groups.map(group => group.bytes));
    $('#studio-storage').replaceChildren(...report.groups.map(group => {
      const fill = el('div', { class: 'storage-fill' });
      fill.style.width = `${Math.max(group.bytes ? 1 : 0, group.bytes / largest * 100)}%`;
      return el('div', { class: 'storage-row' }, [el('div', { class: 'storage-label' }, [el('b', { text: group.name }), el('span', { text: `${mb(group.bytes)} · ${group.files.toLocaleString()} files${group.skipped ? ' · linked items skipped' : ''}` })]), el('div', { class: 'storage-track' }, [fill])]);
    }));
  } catch (err) { if (request === studioRequest) $('#studio-status').textContent = err.message; }
}
$('#studio-refresh').addEventListener('click', loadStudio);
function reviewValue(value) { if(value===undefined||value===null)return 'Default';if(typeof value==='boolean')return value?'On':'Off';if(typeof value==='object')return Object.entries(value).map(([k,v])=>k.replaceAll('_',' ')+': '+reviewValue(v)).join(', ');return String(value); }
function reviewChanges(title,changes) {
  if([...$$('.modal-backdrop')].some(m=>!m.hidden))return Promise.resolve(null);
  return new Promise(resolve=>{const previous=document.activeElement;const dialog=el('section',{class:'change-review-dialog',role:'dialog','aria-modal':'true','aria-label':title});const backdrop=el('div',{class:'modal-backdrop change-review-backdrop'},[dialog]);
  dialog.append(el('h2',{text:title}),el('p',{class:'field-help',text:'Select the changes you want. Nothing is applied until you choose Apply. Previous setup can be restored afterward.'}));
  const list=el('div',{class:'change-review-list'});for(const c of changes)list.append(el('label',{class:'change-review-row'},[el('input',{type:'checkbox',class:'review-choice',value:c.id,checked:true}),el('span',{},[el('b',{text:c.label||c.title}),el('small',{text:c.detail||reviewValue(c.before)+' → '+reviewValue(c.after)}),c.preview&&el('details',{},[el('summary',{text:'View proposed settings'}),el('pre',{class:'support-json',text:JSON.stringify(c.preview,null,2)})])]) ]));dialog.append(list);
  const finish=value=>{document.removeEventListener('keydown',key);backdrop.remove();previous?.focus();resolve(value);};const key=e=>{if(e.key==='Escape'){e.preventDefault();finish(null);}};document.addEventListener('keydown',key);
  const controls=el('div',{class:'update-page-actions'},[el('button',{class:'tool-button',text:'Select all',onclick:()=>list.querySelectorAll('input').forEach(c=>c.checked=true)}),el('button',{class:'tool-button',text:'Clear',onclick:()=>list.querySelectorAll('input').forEach(c=>c.checked=false)}),el('button',{class:'tool-button',text:'Cancel',onclick:()=>finish(null)}),el('button',{class:'save-button',text:'Apply selected',onclick:()=>{const ids=[...list.querySelectorAll('input:checked')].map(c=>c.value);if(!ids.length){toast('Select at least one change.');return;}finish(ids);}})]);dialog.append(controls);document.body.append(backdrop);controls.querySelector('button').focus();});
}
$$('[data-preset]').forEach(button => button.addEventListener('click', async () => {
  $$('[data-preset]').forEach(item => item.disabled = true);
  try {const plan=await api.workshopPreview(button.dataset.preset);if(!plan.changes.length){toast('This setup already matches the preset.');return;}const ids=await reviewChanges('Review '+button.dataset.preset+' preset',plan.changes);if(!ids)return;fillSettings(await api.workshopPreset({token:plan.token,ids}));toast('Selected preset changes applied. Use Undo preset to restore the previous setup.');await loadStudio();}
  catch(err){toast(err.message,{error:true});}
  finally{$$('[data-preset]').forEach(item=>item.disabled=false);}
}));
const undoPreset=el('button',{class:'tool-button',text:'Undo last preset',onclick:async()=>{try{fillSettings(await api.workshopUndo());toast('Preset changes undone. Unrelated settings were kept.');await loadStudio();}catch(e){toast(e.message,{error:true});}}});$('#studio-status').after(undoPreset);


const quickActions = [
  { label: 'Account Appearance · skins and owned capes', run: () => showPage('appearance') },
  ...[['home', 'Home'], ['instances', 'Instance library'], ['workshop', 'Client Studio: Setup Studio and storage'], ['recovery', 'Restore points and launch insights'], ['client', 'Sloth Client mod selections'], ['mods', 'Mod Manager and conflict checks'], ['history', 'Launch History and session journal'], ['packs', 'Modrinth modpack library'], ['browse', 'Browse mods and packs'], ['shots', 'Screenshots'], ['settings', 'Settings'], ['updates', 'Update Launcher'], ['log', 'Game Log']].map(([page, label]) => ({ label, run: () => showPage(page) })),
  { label: 'Play Minecraft', run: () => { showPage('home'); play(); } },
  { label: 'Open current game folder', run: () => api.openFolder('game').catch(err => toast(err.message, { error: true })) },
  { label: 'Open mods folder', run: () => api.openFolder('mods').catch(err => toast(err.message, { error: true })) },
  { label: 'Create a new instance', run: () => { showPage('instances'); $('#instance-create').click(); } }
];
let quickIndex = 0, quickMatches = [], quickReturnFocus;
function renderQuick() {
  const term=$('#quick-search').value.toLowerCase().trim();
  const everyday=[['home','Play'],['downloads','Downloads'],['appearance','Account'],['settings','Settings'],['toolbox','Help']].map(([page,label])=>({label,run:()=>showPage(page)}));
  quickMatches = term ? [...everyday,...quickActions].filter(action => action.label.toLowerCase().includes(term)) : everyday;
  quickIndex = Math.min(quickIndex, Math.max(0, quickMatches.length - 1));
  $('#quick-results').replaceChildren(...quickMatches.map((action, index) => el('button', { class: `quick-result${index === quickIndex ? ' selected' : ''}`, text: action.label, onclick: () => { closeQuick(); action.run(); } })));
  if (!quickMatches.length) $('#quick-results').append(el('p', { class: 'field-help', text: 'No matching actions.' }));
  $('#quick-results .selected')?.scrollIntoView({ block: 'nearest' });
}
function openQuick() {
  if ([...$$('.modal-backdrop')].some(modal => !modal.hidden)) return;
  quickReturnFocus = document.activeElement;
  $('#quick-modal').hidden = false;
  $('#quick-search').value = '';
  quickIndex = 0;
  renderQuick();
  $('#quick-search').focus();
}
function closeQuick() { $('#quick-modal').hidden = true; quickReturnFocus?.focus(); }
$('#quick-open').addEventListener('click', openQuick);
$('#quick-close').addEventListener('click', closeQuick);
$('#quick-modal').addEventListener('click', event => { if (event.target === $('#quick-modal')) closeQuick(); });
$('#quick-search').addEventListener('input', () => { quickIndex = 0; renderQuick(); });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#quick-modal').hidden ? openQuick() : closeQuick(); }
  if (!$('#quick-modal').hidden && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    if (event.target.tagName === 'BUTTON' && event.key === 'Enter') return;
    event.preventDefault();
    if (event.key === 'Enter') { const action = quickMatches[quickIndex]; if (action) { closeQuick(); action.run(); } }
    else { quickIndex = (quickIndex + (event.key === 'ArrowDown' ? 1 : -1) + quickMatches.length) % (quickMatches.length || 1); renderQuick(); }
  }
  if (event.key === 'Escape') { if (!$('#quick-modal').hidden) closeQuick(); if (!$('#rename-modal').hidden) closeRename(); }
  if (event.key === 'Tab') {
    const modal = [...$$('.modal-backdrop')].find(item => !item.hidden);
    if (!modal) return;
    const controls = [...modal.querySelectorAll('button, input, select, [tabindex="0"]')].filter(item => !item.disabled && item.getClientRects().length);
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
  }
});

let recoveryWorking = false;
api.onRecoveryProgress(progress => {
  if (recoveryWorking) $('#recovery-status').textContent = `${progress.label}${progress.total ? ` · ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} files` : '…'}`;
});
async function analyzeRecovery() {
  try {
    const result = await api.diagnose();
    const findings = result.findings.length ? result.findings : [{ title: result.hasOutput ? 'No recognized error pattern' : 'Ready when you need it', advice: result.hasOutput ? 'This scan recognizes common errors; it does not prove the game is healthy. Check Game Log for the full output.' : 'After a launch, Sloth can look for memory, Java, graphics and mod-loading errors. Keep the launcher open or minimized to capture output.' }];
    $('#recovery-insights').replaceChildren(...findings.map(f => el('article', { class: 'panel recovery-insight' }, [el('h3', { text: f.title }), el('p', { text: f.advice })])));
  } catch (err) { toast(err.message, { error: true }); }
}
async function loadRecovery() {
  if (recoveryWorking) return;
  $('#recovery-instance').textContent = state.instances.find(i => i.id === state.activeInstanceId)?.name || 'Sloth';
  try {
    const points = await api.recoveryList();
    $('#recovery-list').replaceChildren(...points.map(point => el('article', { class: 'instance-card panel' }, [
      el('span', { class: 'instance-badge current', text: 'RESTORE POINT' }),
      el('h2', { text: point.label || 'Saved setup' }),
      el('p', { class: 'instance-meta', text: point.name }),
      el('p', { class: 'instance-meta', text: new Date(point.createdAt).toLocaleString() }),
      el('p', { class: 'instance-meta', text: `${point.count.toLocaleString()} files · ${mb(point.bytes)}` }),
      el('p',{class:'field-help',text:'Includes: '+(point.groups?.join(', ')||point.scope||'saved setup')+' · restores as a new instance'}),
      el('div', { class: 'instance-card-foot' }, [el('button', { class: 'tool-button', text: 'RESTORE AS NEW INSTANCE', onclick: () => recoveryAction(async () => {
        if(!confirm('Restore '+(point.label||'this setup')+' as a NEW instance? Includes '+(point.groups?.join(', ')||point.scope||'saved setup files')+'. The original instance stays available.'))return 'Restore cancelled.';
        const result = await api.recoveryRestore(point.id);
        state.instances = result.instances;
        state.activeInstanceId = result.activeInstanceId;
        fillSettings(result.settings);
        renderInstances();
        return 'Restored and selected a new instance. Your previous instance is still in the library.';
      }) })])
    ])));
    if (!recoveryWorking) $('#recovery-status').textContent = points.length ? `${points.length} saved restore point${points.length === 1 ? '' : 's'}. Restore checks every file before activating the new instance.` : 'No restore points yet. Save one before changing your setup.';
    await analyzeRecovery();
  } catch (err) { $('#recovery-status').textContent = err.message; }
}
async function recoveryAction(action) {
  if (recoveryWorking) return;
  recoveryWorking = true;
  $('#recovery-status').textContent = 'Working… Large worlds and resource packs can take a few minutes. Keep the launcher open.';
  $('#page-recovery').setAttribute('aria-busy', 'true');
  $('#page-recovery').querySelectorAll('button').forEach(button => button.disabled = true);
  let message;
  try { message = await action(); toast(message); }
  catch (err) { message = err.message; toast(message, { error: true }); }
  finally {
    recoveryWorking = false;
    $('#page-recovery').setAttribute('aria-busy', 'false');
    $('#page-recovery').querySelectorAll('button').forEach(button => button.disabled = false);
    await loadRecovery();
    $('#recovery-status').textContent = message;
  }
}
$('#recovery-save').addEventListener('click', () => recoveryAction(async () => {
  await api.recoveryCreate($('#recovery-label').value);
  $('#recovery-label').value = '';
  return 'Restore point saved. You can now experiment with this setup.';
}));
$('#recovery-refresh').addEventListener('click', loadRecovery);
$('#recovery-analyze').addEventListener('click', analyzeRecovery);
$('#recovery-folder').addEventListener('click', () => api.recoveryFolder().catch(err => toast(err.message, { error: true })));

const instanceModal = $('#instance-modal');
function closeInstanceModal() { instanceModal.hidden = true; $('#instance-create').focus(); }
$('#instance-create').addEventListener('click', () => { instanceModal.hidden = false; $('#instance-name').value = ''; $('#instance-copy').checked = false; $('#instance-name').focus(); });
$('#instance-cancel').addEventListener('click', closeInstanceModal);
instanceModal.addEventListener('click', event => { if (event.target === instanceModal) closeInstanceModal(); });
$('#instance-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('#instance-submit');
  submit.disabled = true;
  try {
    const result = await api.createInstance({ name: $('#instance-name').value, duplicate: $('#instance-copy').checked });
    state.instances = result.instances;
    state.activeInstanceId = result.activeInstanceId;
    fillSettings(result.settings);
    renderInstances();
    closeInstanceModal();
    toast(`Created ${state.instances.find(i => i.id === state.activeInstanceId)?.name}.`);
  } catch (err) { toast(err.message, { error: true }); }
  finally { submit.disabled = false; }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !instanceModal.hidden) closeInstanceModal(); });

// Official account appearance; access tokens remain in the main process.
let appearanceUuid = null, appearanceProfile = null, skinLoadouts = [], appearanceDraft = null, appearanceWorking = false;
let localCapeData = null, localCapeGeneration = 0;
const localCapeImages = new Map();
function renderLocalCapes() {
  const account = activeAccount(), current = localCapeData?.instanceId === state.activeInstanceId ? localCapeData : null;
  const locked = appearanceWorking || !account || !current?.supported || state.game.running || state.game.busy;
  $('#local-cape-account').disabled = locked || current?.selected === 'account';
  $('#local-cape-selection').textContent = current ? `${current.instanceName} · ${current.entries.find(c => c.id === current.selected)?.name || 'Real account cape'} · ${current.supported ? 'Saved for next launch' : 'Sloth client required'}` : 'Collection not loaded for this game profile.';
  const query = $('#local-cape-query').value.toLowerCase().trim();
  const entries = current?.entries.filter(c => c.name.toLowerCase().includes(query)) || [];
  $('#local-capes').replaceChildren(...entries.map(c => el('article', { class: `appearance-cape-card local-cape-card${current.selected === c.id ? ' selected' : ''}` }, [
    capePreview(localCapeImages.get(c.id)), el('h3', { text: c.name }), el('span', { class: 'field-help', text: 'Local preview only' }),
    Object.assign(el('button', { class: 'tool-button', text: current.selected === c.id ? 'Selected locally' : 'Wear locally', onclick: () => selectLocalCape(c.id) }), { disabled: locked || current.selected === c.id })
  ])));
  if (current && !entries.length) $('#local-capes').append(el('p', { class: 'field-help', text: 'No capes match this search.' }));
}
async function loadLocalCapes() {
  const uuid = activeAccount()?.uuid, instanceId = state.activeInstanceId, generation = ++localCapeGeneration;
  if (!uuid) return;
  const valid = () => generation === localCapeGeneration && activeAccount()?.uuid === uuid && state.activeInstanceId === instanceId;
  $('#local-cape-status').textContent = 'Loading your local collection…';
  try {
    const data = await api.localCapesList({ uuid });
    if (!valid()) return;
    localCapeData = data; renderLocalCapes();
    $('#local-cape-status').textContent = `${data.entries.length} designs available. Loading texture previews…`;
    let cursor = 0, failures = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (valid() && cursor < data.entries.length) {
        const entry = data.entries[cursor++];
        if (localCapeImages.has(entry.id)) continue;
        try { const image = await api.localCapePreview({ uuid, id: entry.id }); if (valid()) localCapeImages.set(entry.id, image); }
        catch { failures++; }
      }
    }));
    if (valid()) { renderLocalCapes(); $('#local-cape-status').textContent = failures ? `${failures} previews could not load. You can retry by reopening Appearance; wearing a cape also retries its download.` : `${data.entries.length} designs ready, including Founder’s. Choose one to wear on your next Sloth launch.`; }
  } catch (e) { if (valid()) $('#local-cape-status').textContent = e.message; }
}
function selectLocalCape(id) {
  const instanceId = localCapeData?.instanceId;
  appearanceAction(async uuid => {
    const result = await api.localCapeSelect({ uuid, instanceId, id });
    if (activeAccount()?.uuid === uuid && state.activeInstanceId === instanceId) localCapeData = result;
    $('#local-cape-status').textContent = id === 'account' ? 'Local override removed. Your account cape will appear on the next launch.' : 'Local cape saved. Relaunch Sloth Minecraft to see it on your own avatar.';
    return 'Local cape preference saved. Your online Minecraft account was not changed.';
  });
}
function syncAppearanceAccount() {
  const uuid = activeAccount()?.uuid || null;
  if (uuid !== appearanceUuid) {
    appearanceUuid = uuid; appearanceProfile = null; skinLoadouts = []; appearanceDraft = null;
    localCapeData = null; localCapeGeneration++;
    $('#appearance-status').textContent = uuid ? 'Refresh to load this account’s appearance.' : 'Sign in with Microsoft to manage your appearance.';
    renderAppearance();
    if (uuid && $('#page-appearance').classList.contains('active')) queueMicrotask(loadLocalCapes);
  }
}
function skinPreview(skin, variant = 'classic') {
  const canvas = el('canvas', { class: 'skin-preview', width: 224, height: 192, role: 'img', 'aria-label': `${variant} skin front and back preview` });
  if (!skin) return el('p', { class: 'field-help', text: 'Skin preview unavailable.' });
  const image = new Image(); image.onload = () => {
    const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false;
    const slim = variant === 'slim', arm = slim ? 3 : 4, modern = image.height === 64, scale = 5;
    for (const back of [false, true]) {
      const offset = back ? 126 : 18;
      const draw = (sx, sy, w, h, x, y) => c.drawImage(image, sx, sy, w, h, offset + x * scale, 8 + y * scale, w * scale, h * scale);
      draw(back ? 24 : 8, 8, 8, 8, 4, 0); draw(back ? 56 : 40, 8, 8, 8, 4, 0);
      draw(back ? 32 : 20, 20, 8, 12, 4, 8);
      draw(back ? (slim ? 51 : 52) : 44, 20, arm, 12, 4 - arm, 8);
      draw(modern ? (back ? (slim ? 43 : 44) : 36) : (back ? (slim ? 51 : 52) : 44), modern ? 52 : 20, arm, 12, 12, 8);
      draw(back ? 12 : 4, 20, 4, 12, 4, 20);
      draw(modern ? (back ? 28 : 20) : (back ? 12 : 4), modern ? 52 : 20, 4, 12, 8, 20);
      if (modern) {
        draw(back ? 32 : 20, 36, 8, 12, 4, 8);
        draw(back ? (slim ? 51 : 52) : 44, 36, arm, 12, 4 - arm, 8);
        draw(back ? (slim ? 59 : 60) : 52, 52, arm, 12, 12, 8);
        draw(back ? 12 : 4, 36, 4, 12, 4, 20); draw(back ? 12 : 4, 52, 4, 12, 8, 20);
      }
      c.fillStyle = '#bcaeb8'; c.font = '11px Segoe UI'; c.fillText(back ? 'BACK' : 'FRONT', offset + 23, 186);
    }
  }; image.src = skin; return canvas;
}
function capePreview(image) {
  const canvas = el('canvas', { class: 'cape-preview', width: 80, height: 128, role: 'img', 'aria-label': 'Cape texture preview' });
  if (!image) return el('span', { class: 'cape-placeholder', text: '◇' });
  const img = new Image(); img.onload = () => { const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; const ratio = img.width / 64; c.drawImage(img, ratio, ratio, 10 * ratio, 16 * ratio, 0, 0, 80, 128); }; img.src = image; return canvas;
}
function renderAppearance() {
  const account = activeAccount();
  $('#appearance-account').textContent = account ? `${account.name.toUpperCase()} · JAVA ACCOUNT` : 'SELECT AN ACCOUNT';
  const profile = appearanceProfile?.uuid === account?.uuid ? appearanceProfile : null;
  $('#appearance-current').replaceChildren(skinPreview(profile?.skin || account?.skin, profile?.variant || account?.skinVariant));
  $('#appearance-current-detail').textContent = profile ? `${profile.variant === 'slim' ? 'Slim' : 'Classic'} arms · ${profile.capeEquipped ? profile.equippedCape?.name || 'Cape equipped' : profile.ownedCapesLoaded === false ? 'Cape selection unavailable' : 'Cape hidden'} · ${profile.source || 'Account profile'} · Flat texture preview` : account?.skin ? 'Last saved skin preview. Refresh to load the current online skin and cape choices.' : 'Refresh your signed-in profile to load your skin and owned capes.';
  $('#appearance-equipped-cape').replaceChildren(...(profile?.equippedCape ? [el('div', { class: 'appearance-equipped' }, [capePreview(profile.equippedCape.image), el('p', { class: 'field-help', text: `${profile.equippedCape.name} · Equipped in Java` })])] : []));
  $('#appearance-cape-count').textContent = profile?.ownedCapesLoaded === true ? `${profile.capes.length} owned capes returned` : 'Ownership list not loaded';
  $('#appearance-reauth').hidden = !account;
  $('#appearance-draft').replaceChildren(...(appearanceDraft ? [skinPreview(appearanceDraft, $('#appearance-model').value)] : []));
  const capeSelect = $('#appearance-loadout-cape'), previousCape = capeSelect.value;
  capeSelect.replaceChildren(el('option', { value: 'keep', text: 'Keep current cape' }), el('option', { value: '', text: 'Hide cape' }), ...(profile?.capes || []).map(c => el('option', { value: c.id, text: c.name })));
  capeSelect.value = [...capeSelect.options].some(o => o.value === previousCape) ? previousCape : 'keep';
  const capeCards = (profile?.capes || []).map(c => el('article', { class: 'appearance-cape-card' }, [capePreview(c.image), el('h3', { text: c.name }), el('button', { class: 'tool-button', text: c.active ? 'Selected' : 'Use cape', onclick: () => changeAccountCape(c.id) })]));
  if (profile && profile.ownedCapesLoaded !== false) capeCards.unshift(el('article', { class: 'appearance-cape-card' }, [el('span', { class: 'cape-placeholder', text: '—' }), el('h3', { text: 'No cape' }), el('button', { class: 'tool-button', text: profile.capeEquipped ? 'Hide cape' : 'Selected', onclick: () => changeAccountCape('') })]));
  $('#appearance-capes').replaceChildren(...(capeCards.length ? capeCards : [el('p', { class: 'field-help', text: profile?.ownedCapesLoaded === false ? 'Your skin is available, but authenticated cape access failed. Sign in again to load owned cape choices.' : 'Refresh to see owned capes. An account with no owned capes can still use skin loadouts.' })]));
  const query = $('#appearance-query').value.toLowerCase();
  $('#appearance-loadouts').replaceChildren(...skinLoadouts.filter(i => i.name.toLowerCase().includes(query)).map(i => el('article', { class: 'instance-card panel appearance-loadout' }, [
    skinPreview(i.skin, i.variant), el('h2', { text: i.name }), el('p', { class: 'field-help', text: `${i.variant === 'slim' ? 'Slim' : 'Classic'} arms · ${i.cape === 'keep' ? 'Keep current cape' : i.cape === '' ? 'Hide cape' : profile?.capes.find(c => c.id === i.cape)?.name || 'Saved cape · ownership checked when applying'}` }),
    el('div', { class: 'instance-card-foot' }, [el('button', { class: 'tool-button', text: 'Apply to account', onclick: () => applySkinLoadout(i) }), el('button', { class: 'tool-button', text: 'Remove saved copy', onclick: () => removeSkinLoadout(i) })])
  ])));
  if (!skinLoadouts.length) $('#appearance-loadouts').append(el('p', { class: 'field-help', text: 'No saved skins yet. Import a PNG or capture your current skin above.' }));
  $$('#page-appearance button').forEach(b => b.disabled = appearanceWorking || !account || state.game.running || state.game.busy);
  $('#appearance-refresh').disabled = appearanceWorking || !account;
  $('#appearance-capture').disabled ||= !profile?.skin;
  $('#appearance-save').disabled ||= !appearanceDraft;
  renderLocalCapes();
}
async function appearanceAction(action) {
  if (appearanceWorking) { $('#appearance-status').textContent = 'A profile request is already in progress. Please wait.'; return; }
  if (!activeAccount()) { $('#appearance-status').textContent = 'Sign in with Microsoft using the account selector first.'; return; }
  const uuid = activeAccount().uuid; appearanceWorking = true;
  try { $('#appearance-status').textContent = 'Loading account appearance…'; renderAppearance(); const message = await action(uuid); if (activeAccount()?.uuid === uuid) $('#appearance-status').textContent = message || 'Done.'; }
  catch (e) { $('#appearance-status').textContent = e.message; toast(e.message, { error: true }); }
  finally { appearanceWorking = false; renderAppearance(); }
}
function acceptAppearance(result, uuid) {
  if (activeAccount()?.uuid !== uuid) return;
  appearanceProfile = result.profile; skinLoadouts = result.loadouts; renderAppearance();
}
async function loadAppearance() {
  syncAppearanceAccount(); if (!appearanceUuid) return;
  loadLocalCapes();
  const uuid = appearanceUuid;
  try { const items = await api.appearanceList({ uuid }); if (appearanceUuid === uuid) { skinLoadouts = items; renderAppearance(); } }
  catch (e) { $('#appearance-status').textContent = e.message; }
  if (!appearanceProfile && !appearanceWorking) refreshAppearance();
}
function refreshAppearance() { return appearanceAction(async uuid => { acceptAppearance(await api.appearanceRefresh({ uuid }), uuid); return appearanceProfile?.warnings.length ? appearanceProfile.warnings.join(' ') : 'Current skin and owned capes loaded. Changes can take time to reach Minecraft.'; }); }
function changeAccountCape(cape) {
  if (!confirm(`Change the cape for ${activeAccount()?.name} across Minecraft launchers and servers?`)) return;
  appearanceAction(async uuid => { try { acceptAppearance(await api.appearanceCape({ uuid, cape }), uuid); return 'Cape selection accepted. Relaunch Minecraft to see the change.'; } catch (e) { appearanceProfile = null; throw e; } });
}
function applySkinLoadout(item) {
  if (!confirm(`Apply “${item.name}” to ${activeAccount()?.name}? This updates your online Minecraft skin and the saved cape choice across launchers and servers.`)) return;
  appearanceAction(async uuid => { try { acceptAppearance(await api.appearanceApply({ uuid, id: item.id }), uuid); return 'Loadout changes accepted. Relaunch Minecraft to see the change.'; } catch (e) { appearanceProfile = null; throw e; } });
}
function removeSkinLoadout(item) {
  if (!confirm(`Remove the saved copy of “${item.name}”? Your online skin will stay as it is.`)) return;
  appearanceAction(async uuid => { skinLoadouts = await api.appearanceRemove({ uuid, id: item.id }); return 'Saved loadout removed. Online appearance unchanged.'; });
}
$('#appearance-refresh').addEventListener('click', refreshAppearance);
$('#local-cape-query').addEventListener('input', renderLocalCapes);
$('#local-cape-account').addEventListener('click', () => selectLocalCape('account'));
$('#appearance-reauth').addEventListener('click', async () => { await signIn(); appearanceProfile = null; if (activeAccount()) await refreshAppearance(); });
$('#appearance-import').addEventListener('click', () => appearanceAction(async uuid => { const image = await api.appearanceImport({ uuid }); if (!image) return 'Import cancelled.'; appearanceDraft = image; $('#appearance-name').value = ''; return 'Skin loaded into the preview. Choose the arm model and save a loadout.'; }));
$('#appearance-capture').addEventListener('click', () => { if (!appearanceProfile?.skin) return; appearanceDraft = appearanceProfile.skin; $('#appearance-model').value = appearanceProfile.variant; $('#appearance-loadout-cape').value = appearanceProfile.ownedCapesLoaded === false ? 'keep' : appearanceProfile.capeId; $('#appearance-name').value = `${appearanceProfile.name} current`; renderAppearance(); $('#appearance-status').textContent = 'Current skin copied into the loadout editor. Save to keep this combination.'; });
$('#appearance-save').addEventListener('click', () => appearanceAction(async uuid => { const name = $('#appearance-name').value.trim(); if (!name || !appearanceDraft) throw new Error('Choose a skin and enter a loadout name.'); skinLoadouts = await api.appearanceSave({ uuid, loadout: { name, skin: appearanceDraft, variant: $('#appearance-model').value, cape: $('#appearance-loadout-cape').value } }); return 'Loadout saved locally. Use Apply to account when ready.'; }));
$('#appearance-model').addEventListener('change', renderAppearance);
$('#appearance-query').addEventListener('input', renderAppearance);


// ---------- accounts ----------
function drawHead(canvas, skin, name) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  if (!skin) {
    ctx.fillStyle = '#29252b';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = `hsl(${accentHue()} 100% 70%)`;
    ctx.font = `800 ${Math.round(size * 0.5)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name ? name[0].toUpperCase() : '?', size / 2, size / 2 + 1);
    return;
  }
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
  };
  img.src = skin;
}

function activeAccount() {
  return state.accounts.find(a => a.active) || null;
}

function renderAccounts() {
  if(state.settings)loadReadiness();
  if (officialFriendsAccount && state.accounts.find(x=>x.active)?.uuid !== officialFriendsAccount) {
    officialFriendsAccount=null; $('#minecraft-friends-list').replaceChildren(); $('#minecraft-friends-status').textContent='Account changed. Load the selected account’s friends when ready.';
  }
  syncAppearanceAccount();
  const active = activeAccount();
  drawHead($('#account-avatar'), active?.skin, active?.name);
  $('#account-name').textContent = active ? active.name : 'Not signed in';
  const sub = $('#account-sub');
  sub.textContent = !active ? 'Sign in with Microsoft' : active.needsReauth ? 'Sign in again' : 'Microsoft account';
  sub.classList.toggle('warn', Boolean(active?.needsReauth));

  const list = $('#account-list');
  list.replaceChildren();
  for (const account of state.accounts) {
    const head = el('canvas', { class: 'avatar', width: 30, height: 30 });
    drawHead(head, account.skin, account.name);
    const status = account.needsReauth ? ['Sign in again', 'warn'] : account.active ? ['Active', 'active'] : ['Switch to this account', ''];
    list.append(el('div', { class: 'account-row' }, [
      el('button', {
        class: 'select',
        title: account.needsReauth ? 'Sign in again' : `Use ${account.name}`,
        onclick: () => (account.needsReauth ? signIn() : switchAccount(account.uuid))
      }, [head, el('span', {}, [el('b', { text: account.name }), el('small', { class: status[1], text: status[0] })])]),
      el('button', { class: 'remove', title: `Sign out ${account.name}`, text: 'Sign out', onclick: () => signOut(account) })
    ]));
  }
  if (!state.accounts.length) list.append(el('p', { class: 'menu-note', text: 'No accounts yet.' }));
  renderPlay();
}

function toggleAccountMenu(force) {
  const menu = $('#account-menu');
  const open = force ?? menu.hidden;
  menu.hidden = !open;
  $('#account-button').setAttribute('aria-expanded', String(open));
}
$('#account-button').addEventListener('click', event => { event.stopPropagation(); toggleAccountMenu(); });
document.addEventListener('click', event => { if (!$('#account-menu').contains(event.target)) toggleAccountMenu(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') toggleAccountMenu(false); });

// Sign-in runs in the player's own browser; the launcher only shows the code and waits.
async function signIn() {
  if (state.signingIn) return;
  state.signingIn = true;
  toggleAccountMenu(false);
  $('#add-account').disabled = true;
  try {
    state.accounts = await api.signIn();
    renderAccounts();
    toast(`Signed in as ${activeAccount()?.name}.`);
  } catch (err) {
    if (err.code !== 'cancelled') toast(err.message, { error: true });
  } finally {
    state.signingIn = false;
    $('#add-account').disabled = false;
    showSignInPrompt(null);
  }
}
$('#add-account').addEventListener('click', event => { event.stopPropagation(); signIn(); });

function showSignInPrompt(prompt) {
  clearInterval(showSignInPrompt.timer);
  $('#signin-modal').hidden = !prompt;
  if (!prompt) return;
  const device = prompt.kind === 'device';
  $('#signin-device').hidden = !device;
  $('#signin-browser').hidden = device;
  $('#reopen-signin').hidden = !device;
  if (device) {
    $('#signin-code').textContent = prompt.userCode;
    const tick = () => {
      const left = Math.max(0, Math.round((prompt.expiresAt - Date.now()) / 1000));
      $('#signin-expiry').textContent = left ? `Code expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.` : 'Code expired.';
    };
    tick();
    showSignInPrompt.timer = setInterval(tick, 1000);
  }
  $('#cancel-signin').focus();
}
api.onSignInPrompt(showSignInPrompt);
$('#copy-signin-code').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('#signin-code').textContent);
  toast('Code copied. Paste it on the Microsoft page.');
});
$('#reopen-signin').addEventListener('click', () => api.openSignInPage());
$('#cancel-signin').addEventListener('click', () => api.cancelSignIn());
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#signin-modal').hidden) api.cancelSignIn(); });

async function switchAccount(uuid) {
  state.accounts = await api.switchAccount(uuid);
  renderAccounts();
  toggleAccountMenu(false);
}

async function signOut(account) {
  if (!confirm(`Sign out ${account.name}? You can sign back in any time.`)) return;
  state.accounts = await api.signOut(account.uuid);
  renderAccounts();
  toast(`Signed out ${account.name}.`);
}

let readinessRequest=0;
async function loadReadiness(){const request=++readinessRequest;$('#readiness-status').textContent='Checking selected setup…';try{const report=await api.launchReadiness();if(request!==readinessRequest||report.instanceId!==state.activeInstanceId)return null;$('#readiness-status').textContent=report.blocked?'Resolve the blocked items before launching.':report.checks.some(c=>c.level==='warn')?'Setup checked. Review the notices below.':'Setup checked. Play verifies files and online account access.';$('#readiness-checks').replaceChildren(...report.checks.map(c=>el('article',{class:'readiness-check '+c.level},[el('b',{text:c.title}),el('span',{class:'instance-badge',text:c.level.toUpperCase()}),el('p',{text:c.detail})])));const notices=report.checks.filter(c=>c.level==='warn').length;$('#home-readiness-label').textContent=report.blocked?'Setup needs attention':notices?'Setup checks · '+notices+' notices':'Setup checks · ready';if(report.blocked)$('#home-readiness').open=true;return report;}catch(e){if(request===readinessRequest){$('#readiness-status').textContent=e.message;$('#home-readiness-label').textContent='Setup check unavailable';$('#home-readiness').open=true;}return null;}}
$('#readiness-refresh').addEventListener('click',loadReadiness);
// ---------- play ----------
function setPlay(title, subtitle, cls = '', disabled = false) {
  const button = $('#play');
  $('#play-title').textContent = title;
  $('#play-subtitle').textContent = subtitle;
  button.className = `play-button ${cls}`.trim();
  button.disabled = disabled;
  $('.play-triangle').textContent = cls === 'busy' ? '■' : cls === 'running' ? '●' : '▶';
}

function renderPlay() {
  const account = activeAccount();
  const { running, busy } = state.game;
  $('#stop-game').hidden = !running;
  if (busy) setPlay('CANCEL', (state.lastProgress?.label || 'Getting ready').toUpperCase(), 'busy');
  else if (running) setPlay('PLAYING', 'MINECRAFT IS RUNNING', 'running', true);
  else if (!account) setPlay('SIGN IN TO PLAY', 'MICROSOFT ACCOUNT');
  else if (account.needsReauth) setPlay('SIGN IN AGAIN', `SESSION EXPIRED FOR ${account.name.toUpperCase()}`);
  else setPlay('PLAY', `LAUNCH AS ${account.name.toUpperCase()}`);
  $('#progress').hidden = !busy;
  $('#repair').disabled = busy || running;
}

async function play({ repair = false } = {}) {
  const account = activeAccount();
  if (state.game.busy) { api.cancel(); return; }
  if (!account || account.needsReauth) return signIn();
  const readiness=await loadReadiness();
  if(readiness?.blocked){toast('Review the blocked items under Ready to Play.',{error:true});return;}
  if(state.game.busy||state.game.running)return;
  state.game.busy = true;
  state.lastProgress = null;
  showProgress({ stage: 'start', label: repair ? 'Verifying game files' : 'Getting ready' });
  renderPlay();
  try {
    await api.play({ repair });
    toast(repair ? 'Game files verified. Starting Minecraft…' : 'Starting Minecraft…');
  } catch (err) {
    if (err.message !== 'Cancelled.') toast(err.message, { error: true });
    else toast('Cancelled.');
    if(err.code==='seal-changed')showPage('trust');
    if (err.code === 'reauth' || err.code === 'signin') toggleAccountMenu(true);
  } finally {
    state.game.busy = false;
    renderPlay();
  }
}
$('#play').addEventListener('click', () => play());
$('#repair').addEventListener('click', () => { showPage('care'); repairCare(); });
$('#stop-game').addEventListener('click', async () => {
  if (confirm('Force close Minecraft? Unsaved singleplayer progress would be lost.')) await api.stopGame();
});

function showProgress(progress) {
  state.lastProgress = progress;
  const fill = $('#progress-fill');
  $('#progress-label').textContent = progress.label || 'Working';
  let detail = '';
  let fraction = null;
  if (progress.stage === 'download' && progress.totalBytes) {
    fraction = Math.min(1, progress.bytes / progress.totalBytes);
    detail = `${mb(Math.min(progress.bytes, progress.totalBytes))} / ${mb(progress.totalBytes)}`;
  } else if (progress.stage === 'check' && progress.total) {
    fraction = progress.done / progress.total;
    detail = `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} files`;
  }
  $('#progress-detail').textContent = detail;
  fill.classList.toggle('indeterminate', fraction === null);
  fill.style.width = fraction === null ? '' : `${(fraction * 100).toFixed(1)}%`;
  if (state.game.busy) $('#play-subtitle').textContent = (progress.label || '').toUpperCase();
}

api.onProgress(showProgress);
api.onGameState(game => {
  const wasRunning = state.game.running;
  state.game = { ...state.game, ...game };
  syncSeasonalVisibility();
  if(state.game.running){clearScare();resetHeroMotion();syncHauntIdle();}
  renderPlay();
  renderInstances();
  if (wasRunning && !game.running && game.crashed) {
    toast(`Minecraft closed unexpectedly${game.exitCode != null ? ` (exit code ${game.exitCode})` : ''}. Check the Game Log for details.`, { error: true });
    $('#log-dot').hidden = false;
    $('#log-dot').classList.add('bad');
  }
});
api.onAccounts(accounts => { state.accounts = accounts; renderAccounts(); });

// ---------- accent ----------
/** Current accent hue (the --accent-h CSS variable). */
function accentHue() {
  return Number(getComputedStyle(document.documentElement).getPropertyValue('--accent-h')) || 330;
}

function applyAccent(name, { animate = false } = {}) {
  const seasonal=SLOTH_THEMES.find(t=>t.id===state.settings?.seasonalTheme);
  const hue = seasonal&&seasonal.id!=='none'?seasonal.hue:state.accents?.[name];
  if (!Number.isFinite(hue)) return;
  const root = document.documentElement;
  if (animate) {
    root.classList.add('accent-fade');
    clearTimeout(applyAccent.timer);
    applyAccent.timer = setTimeout(() => root.classList.remove('accent-fade'), 450);
  }
  root.style.setProperty('--accent-h', String(hue));
  for (const b of $$('.accent-swatch')) {
    const on = b.dataset.accent === name;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  }
}

$$('.accent-swatch').forEach(button => button.addEventListener('click', async () => {
  const accent = button.dataset.accent;
  applyAccent(accent, { animate: true });
  renderAccounts(); // placeholder avatars use the accent too
  try {
    const saved = await api.saveSettings({ accent });
    state.settings = saved;
    toast(state.settings.seasonalTheme === 'halloween'
      ? `${button.textContent.trim()} accent saved. Halloween stays orange until you turn it off; the game uses your saved accent on the next launch.`
      : `${button.textContent.trim()} accent on. The game picks it up next time you press Play.`);
  } catch (err) {
    toast(err.message, { error: true });
  }
}));

function applySeasonalTheme(settings) {
  const active = settings?.seasonalTheme === 'halloween';
  const selected=SLOTH_THEMES.find(t=>t.id===settings?.seasonalTheme)||SLOTH_THEMES[0];
  document.documentElement.dataset.seasonalTheme=selected.id;
  const scene=$('.holiday-scene');scene.hidden=selected.id==='none'||active;if(scene.hidden)scene.removeAttribute('src');else scene.src=selected.art;
  $('#holiday-description').textContent=selected.name+' · '+selected.description;
  for(const button of document.querySelectorAll('#holiday-themes button'))button.setAttribute('aria-pressed',String(button.dataset.theme===selected.id));
  document.documentElement.dataset.seasonalAnimations = settings?.seasonalAnimations === false ? 'off' : 'on';
  const intensity = ['subtle', 'haunted', 'nightmare'].includes(settings?.seasonalIntensity) ? settings.seasonalIntensity : 'haunted';
  document.documentElement.dataset.seasonalIntensity = intensity;
  $('#halloween-intensity').value = intensity;
  $('#halloween-intensity').disabled = !active;
  $('#halloween-theme').checked = active;
  $('#halloween-animations').checked = settings?.seasonalAnimations !== false;
  $('#halloween-animations').disabled = selected.id==='none';
  $('#halloween-jumpscares').checked = settings?.seasonalJumpscares === true;
  $('#halloween-jumpscares').disabled = !active || intensity === 'subtle';
  $('#halloween-scare-preview').disabled = !active || intensity === 'subtle' || settings?.seasonalAnimations === false;
  if (!scaresAllowed()) clearScare();
  syncHauntIdle();
  if(settings?.seasonalAnimations===false)resetHeroMotion();
  applyAccent(settings?.accent || 'pink');
}

function renderHolidayChoices(){const query=$('#holiday-search').value.toLowerCase().trim();$('#holiday-themes').replaceChildren(...SLOTH_THEMES.filter(t=>(t.name+' '+t.description).toLowerCase().includes(query)).map(theme=>{const b=el('button',{type:'button',class:'holiday-card','data-theme':theme.id,'aria-pressed':String(state.settings?.seasonalTheme===theme.id),onclick:()=>saveSeasonalChoice({seasonalTheme:theme.id},theme.name+' theme applied.')},[el('img',{src:theme.art,alt:'',loading:'lazy'}),el('span',{text:theme.name})]);return b;}));}
$('#holiday-search').addEventListener('input',renderHolidayChoices);renderHolidayChoices();

async function saveSeasonalChoice(patch, message) {
  $('#halloween-theme').disabled = true;
  $('#halloween-animations').disabled = true;
  $('#halloween-intensity').disabled = true;
  $('#halloween-jumpscares').disabled = true;
  $('#halloween-scare-preview').disabled = true;
  try {
    state.settings = await api.saveSettings(patch);
    applySeasonalTheme(state.settings);
    renderAccounts();
    toast(message);
  } catch (error) {
    applySeasonalTheme(state.settings);
    toast(error.message, { error: true });
  } finally {
    $('#halloween-theme').disabled = false;
    $('#halloween-animations').disabled = state.settings?.seasonalTheme === 'none';
    applySeasonalTheme(state.settings);
  }
}
$('#halloween-theme').addEventListener('change', event => saveSeasonalChoice(
  { seasonalTheme: event.currentTarget.checked ? 'halloween' : 'none' },
  event.currentTarget.checked ? 'Halloween theme enabled.' : 'Your regular Sloth theme is restored.'
));
$('#halloween-animations').addEventListener('change', event => saveSeasonalChoice(
  { seasonalAnimations: event.currentTarget.checked },
  event.currentTarget.checked ? 'Halloween animations enabled. Reduced motion still takes priority.' : 'Halloween animations turned off.'
));
$('#halloween-intensity').addEventListener('change', event => saveSeasonalChoice(
  { seasonalIntensity: event.currentTarget.value }, 'Halloween atmosphere intensity saved.'
));
const scareFaces=["creeper-pumpkin","witch-ghast","pumpkin-enderman","pumpkin-skeleton"];let scareIndex=-1;
function scareDelay(){return state.settings?.seasonalIntensity==='nightmare'?45000+Math.random()*45000:90000+Math.random()*90000;}
let scareElement=null, scareEnd=null, nextScareAt=Date.now()+scareDelay();
function scaresAllowed(preview=false){return state.settings?.seasonalTheme==='halloween' && state.settings?.seasonalIntensity!=='subtle' && state.settings?.seasonalAnimations!==false && (preview||state.settings?.seasonalJumpscares===true) && !document.hidden && document.hasFocus() && !document.body.classList.contains('reduce-motion') && !document.body.classList.contains('high-contrast') && !matchMedia('(prefers-reduced-motion: reduce)').matches && !state.game.busy && !state.game.running && ![...$$('.modal-backdrop')].some(m=>!m.hidden) && !document.querySelector('dialog[open]');}
function clearScare(){if(scareEnd)clearTimeout(scareEnd);scareEnd=null;scareElement?.remove();scareElement=null;}
function showScare(preview=false){if(!scaresAllowed(preview))return false;clearScare();scareIndex=preview?(scareIndex+1)%scareFaces.length:(scareIndex+1+Math.floor(Math.random()*(scareFaces.length-1)))%scareFaces.length;const face=el('img',{src:'assets/scare-'+scareFaces[scareIndex]+'.svg',class:'scare-face scare-'+scareFaces[scareIndex],alt:''});scareElement=el('div',{class:'haunted-jumpscare','aria-hidden':'true',inert:true},[el('div',{class:'scare-omen'}),face]);document.body.append(scareElement);scareEnd=setTimeout(clearScare,3400);return true;}

$('#halloween-jumpscares').addEventListener('change',e=>saveSeasonalChoice({seasonalJumpscares:e.currentTarget.checked},e.currentTarget.checked?'Haunted jumpscares enabled.':'Jumpscares turned off.'));
$('#halloween-scare-preview').addEventListener('click',()=>{if(!showScare(true))toast('Enable Halloween animation in Haunted or Nightmare; reduced motion and high contrast suppress jumpscares.');nextScareAt=Date.now()+scareDelay();});
function syncHauntIdle(){const active=scaresAllowed()&&$('#page-home').classList.contains('active');document.body.classList.toggle('haunt-idle',active);const lurker=$('.halloween-lurker img');if(active&&!lurker.hasAttribute('src'))lurker.src='assets/scare-pumpkin-enderman.svg';else if(!active)lurker.removeAttribute('src');}
setInterval(()=>{syncHauntIdle();if(scareElement&&!scaresAllowed(true))clearScare();if(Date.now()<nextScareAt)return;nextScareAt=Date.now()+scareDelay();if($('#page-home').classList.contains('active'))showScare();},1000);
window.addEventListener('blur',clearScare);document.addEventListener('visibilitychange',()=>{clearScare();nextScareAt=Date.now()+scareDelay();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&scareElement){clearScare();e.preventDefault();}},true);
function syncSeasonalVisibility(){document.body.classList.toggle('effects-paused',document.hidden||!document.hasFocus()||Boolean(state.game.running));document.body.classList.toggle('gameplay-active',Boolean(state.game.running));}
syncSeasonalVisibility();
document.addEventListener('visibilitychange', syncSeasonalVisibility);
window.addEventListener('focus',syncSeasonalVisibility);
window.addEventListener('blur',syncSeasonalVisibility);

// Pointer motion is limited to hero artwork; one scheduled frame per mouse event batch.
const motionHero=$('.hero');let heroFrame=0,heroPointer=null;
function resetHeroMotion(){heroPointer=null;if(heroFrame)cancelAnimationFrame(heroFrame);heroFrame=0;motionHero?.style.setProperty('--look-x','0');motionHero?.style.setProperty('--look-y','0');}
motionHero?.addEventListener('pointermove',e=>{if(state.game.running||document.hidden||!document.hasFocus()||document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches||state.settings?.seasonalAnimations===false)return;heroPointer={x:e.clientX,y:e.clientY};if(heroFrame)return;heroFrame=requestAnimationFrame(()=>{heroFrame=0;if(!heroPointer)return;const rect=motionHero.getBoundingClientRect();motionHero.style.setProperty('--look-x',String(Math.max(-1,Math.min(1,(heroPointer.x-rect.left)/rect.width*2-1))));motionHero.style.setProperty('--look-y',String(Math.max(-1,Math.min(1,(heroPointer.y-rect.top)/rect.height*2-1))));});},{passive:true});
motionHero?.addEventListener('pointerleave',resetHeroMotion);window.addEventListener('blur',()=>{resetHeroMotion();document.body.classList.remove('haunt-idle');});document.addEventListener('visibilitychange',()=>{resetHeroMotion();syncHauntIdle();});
// ---------- settings ----------
function fillSettings(s) {
  state.settings = s;
  $('#update-channel').value = s.updateChannel || 'stable';
  renderChannelStatus();
  $('#capture-replay-enabled').checked = Boolean(s.mods?.replaymod);
  applyAccessibility(s.accessibility);
  $('#text-scale').value = String(s.accessibility?.textScale || 1);
  $('#reduce-motion').checked = Boolean(s.accessibility?.reduceMotion);
  $('#high-contrast').checked = Boolean(s.accessibility?.highContrast);
  applyAccent(s.accent);
  applySeasonalTheme(s);
  const memory = $('#memory');
  memory.max = state.memory.maxMb;
  memory.value = s.memoryMb;
  $('#memory-value').textContent = gb(s.memoryMb);
  $('#on-launch').value = s.onLaunch;
  $('#session-reminder').value = String(s.reminderMinutes || 0);
  $('#instance-launch-note').textContent = `Launch profile: ${state.instances.find(i => i.id === state.activeInstanceId)?.name || 'Sloth'}. Memory, window size, launch behavior and reminders are specific to this instance. Account, Java, accent and backup policy are shared.`;
  updateSessionTimer();
  $('#resolution-mode').value = s.resolution ? 'custom' : 'default';
  $('#res-width').value = s.resolution?.width || '';
  $('#res-height').value = s.resolution?.height || '';
  syncResolutionInputs();
  $('#java-path').value = s.javaPath;
  $('#auth-mode').value = s.authMode;
  $('#auth-client').value = s.authClientId;
  syncAuthInputs();
  $('#setup-memory').textContent = gb(s.memoryMb);
  const enabledPerf = state.catalog.filter(m => m.category === 'performance' && s.mods[m.slug]).length;
  $('#setup-mods').textContent = String(enabledPerf);
  renderMods();
  renderPlay();
}

function syncResolutionInputs() {
  const custom = $('#resolution-mode').value === 'custom';
  $('#res-width').disabled = !custom;
  $('#res-height').disabled = !custom;
}
function syncAuthInputs() {
  const azure = $('#auth-mode').value === 'azure';
  $('#auth-client').disabled = !azure;
  if (!azure) $('#auth-client').value = '00000000402b5328';
}
$('#resolution-mode').addEventListener('change', syncResolutionInputs);
$('#auth-mode').addEventListener('change', () => { syncAuthInputs(); if ($('#auth-mode').value === 'azure') $('#auth-client').value = ''; });
$('#memory').addEventListener('input', event => {
  const value = Number(event.target.value);
  $('#memory-value').textContent = gb(value);
  $('#memory-help').textContent = value > 8192 ? 'More than 8 GB rarely helps and can cause longer pauses.' : value < 3072 ? 'Below 3 GB you may see stutters in busy areas.' : '4 GB is plenty with the performance pack.';
});

$('#save-settings').addEventListener('click', async () => {
  const custom = $('#resolution-mode').value === 'custom';
  try {
    const saved = await api.saveSettings({
      memoryMb: Number($('#memory').value),
      onLaunch: $('#on-launch').value,
      reminderMinutes: Number($('#session-reminder').value),
      accessibility: { textScale: Number($('#text-scale').value), reduceMotion: $('#reduce-motion').checked, highContrast: $('#high-contrast').checked },
      resolution: custom ? { width: $('#res-width').value || 1920, height: $('#res-height').value || 1080 } : null,
      authMode: $('#auth-mode').value,
      authClientId: $('#auth-client').value
    });
    const authChanged = saved.authMode !== state.settings.authMode || saved.authClientId !== state.settings.authClientId;
    fillSettings(saved);
    $('#save-state').textContent = 'Saved.';
    toast(authChanged ? 'Saved. Sign in again to use the new sign-in app.' : 'Settings saved.');
  } catch (err) {
    toast(err.message, { error: true });
  }
});

$('#choose-java').addEventListener('click', async () => {
  try {
    const saved = await api.chooseJava();
    fillSettings(saved);
    if (saved.javaPath) toast('Custom Java selected. It needs to be Java 21 or newer.');
  } catch (err) {
    toast(err.message, { error: true });
  }
});
$('#clear-java').addEventListener('click', async () => {
  try { fillSettings(await api.saveSettings({ javaPath: '' })); toast('Using the bundled Java 21.'); }
  catch (err) { toast(err.message, { error: true }); }
});

$$('[data-folder]').forEach(button => button.addEventListener('click', () => api.openFolder(button.dataset.folder).catch(err => toast(err.message, { error: true }))));

// ---------- mods ----------
function renderMods() {
  const list = $('#mod-list');
  list.replaceChildren();
  for (const [category, title] of [['performance', 'PERFORMANCE'], ['optional', 'EXTRAS & QUALITY OF LIFE'], ['shader', 'SHADERS (TURN ON IRIS AUTOMATICALLY)'], ['resourcepack', 'RESOURCE PACKS']]) {
    list.append(el('div', { class: 'mod-group', text: title }));
    for (const mod of state.catalog.filter(m => m.category === category)) {
      const input = el('input', { type: 'checkbox', 'aria-label': `Enable ${mod.name}` });
      input.checked = Boolean(state.settings.mods[mod.slug]);
      input.addEventListener('change', async () => {
        input.disabled = true;
        try {
          const saved = await api.saveSettings({ mods: { [mod.slug]: input.checked } });
          fillSettings(saved);
          toast(`${mod.name} ${input.checked ? 'enabled' : 'disabled'}. Applies next launch.`);
        } catch (err) { input.checked = Boolean(state.settings.mods[mod.slug]); input.disabled = false; toast(err.message, { error: true }); }
      });
      list.append(el('div', { class: 'mod-row' }, [
        el('div', { class: 'mod-info' }, [el('b', { text: mod.name }), el('small', { text: mod.version }), el('p', { text: mod.description })]),
        el('label', { class: 'switch-row inline' }, [input, el('span', { class: 'switch' })])
      ]));
    }
  }
}

// ---------- log ----------
const logView = $('#log-view');
function lineClass(line) {
  if (/\/(ERROR|FATAL)\]|Exception|^\s+at /.test(line)) return 'error';
  if (/\/WARN\]/.test(line)) return 'warn';
  return '';
}
function appendLog(lines, reset = false) {
  if (reset) logView.replaceChildren();
  if (!lines.length) return;
  logView.querySelector('.log-empty')?.remove();
  const frag = document.createDocumentFragment();
  for (const line of lines) {
    const cls = lineClass(line);
    frag.append(cls ? el('span', { class: cls, text: `${line}\n` }) : document.createTextNode(`${line}\n`));
  }
  logView.append(frag);
  while (logView.childNodes.length > 3000) logView.firstChild.remove();
  scrollLog();
  if (!$('#page-log').classList.contains('active')) $('#log-dot').hidden = false;
}
function scrollLog(force = false) {
  if (force || $('#log-follow').checked) logView.scrollTop = logView.scrollHeight;
}
api.onLog(lines => appendLog(lines));
api.onGameState(game => {
  if (game.running && !game.busy) {
    $('#log-dot').classList.remove('bad');
    $('#log-summary').textContent = 'Live output from the running game.';
  }
});
$('#copy-log').addEventListener('click', async () => {
  const lines = await api.gameLog();
  await navigator.clipboard.writeText(lines.join('\n'));
  toast(lines.length ? `Copied ${lines.length} log lines.` : 'The log is empty.');
});

// ---------- Client Studio and optional preferences ----------
let syncPlan = null, syncWorking = false, experienceRead = 0;
const syncChoices = () => ({ hud: $('#sync-hud').checked, visual: $('#sync-visual').checked, profiles: $('#sync-profiles').checked, launcher: $('#sync-launcher').checked });
function invalidateSyncPlan() { syncPlan = null; $('#sync-apply').disabled = true; $('#sync-review-result').textContent = ''; }
for (const id of ['sync-hud', 'sync-visual', 'sync-profiles', 'sync-launcher']) $(`#${id}`).addEventListener('change', invalidateSyncPlan);
async function loadExperience() {
  const read = ++experienceRead; invalidateSyncPlan();
  $('#capture-replay-enabled').checked = Boolean(state.settings?.mods?.replaymod);
  $('#capture-replay-enabled').disabled = Boolean(state.instances.find(i => i.id === state.activeInstanceId)?.pack);
  try { const result = await api.syncStatus(); if (read === experienceRead) $('#sync-folder').textContent = result.enabled ? `Selected folder: ${result.folder}` : 'No sync folder selected.'; }
  catch (error) { toast(error.message, { error: true }); }
}
async function syncAction(fn) {
  if (syncWorking) return;
  syncWorking = true;
  for (const id of ['sync-choose', 'sync-disable', 'sync-publish', 'sync-review', 'sync-apply', 'sync-restore']) $(`#${id}`).disabled = true;
  try { await fn(); }
  catch (error) { $('#sync-status').textContent = error.message; toast(error.message, { error: true }); }
  finally { syncWorking = false; for (const id of ['sync-choose', 'sync-disable', 'sync-publish', 'sync-review', 'sync-restore']) $(`#${id}`).disabled = false; $('#sync-apply').disabled = !syncPlan; }
}
$('#sync-choose').addEventListener('click', () => syncAction(async () => { invalidateSyncPlan(); const s = await api.syncChoose(); $('#sync-folder').textContent = s.enabled ? `Selected folder: ${s.folder}` : 'No sync folder selected.'; $('#sync-status').textContent = s.enabled ? 'Folder connected. Publish your selection or review an existing preference file.' : 'Sync remains off.'; }));
$('#sync-disable').addEventListener('click', () => syncAction(async () => { invalidateSyncPlan(); await api.syncDisable(); $('#sync-folder').textContent = 'No sync folder selected.'; $('#sync-status').textContent = 'Folder disconnected. Previously published files stay in your chosen folder.'; }));
$('#sync-publish').addEventListener('click', () => syncAction(async () => {
  if (!confirm('Publish selected preferences to your chosen folder? This replaces its Sloth preference document. Your cloud provider may upload it.')) return;
  invalidateSyncPlan(); const r = await api.syncPublish(syncChoices()); $('#sync-status').textContent = `Published ${r.modules} module configurations and ${r.profiles} profiles. Wait for your provider to sync before importing on another computer.`;
}));
$('#sync-review').addEventListener('click', () => syncAction(async () => {
  invalidateSyncPlan(); const instanceId = state.activeInstanceId, result = await api.syncReview(syncChoices());
  if (instanceId !== state.activeInstanceId) return;
  syncPlan = { ...result, instanceId }; $('#sync-review-result').textContent = `${result.modules} module configurations; ${result.profileNames.length} new profiles (${result.profileNames.join(', ') || 'none'}); ${result.skipped.length} existing profiles skipped; launcher groups: ${result.launcher.join(', ') || 'none'}. ${result.note}`;
  $('#sync-status').textContent = 'Review complete. Import applies on the next launch; your prior module setup is saved first.';
}));
$('#sync-apply').addEventListener('click', () => syncAction(async () => {
  if (!syncPlan || syncPlan.instanceId !== state.activeInstanceId) throw new Error('Review preferences for this instance again.');
  if (!confirm('Import the reviewed preferences into this instance? Minecraft must be closed. Existing named profiles are preserved.')) return;
  const ids=await reviewChanges('Review imported setup',syncPlan.changes||[]);if(!ids)return;
  const r = await api.syncApply({token:syncPlan.token,ids}); invalidateSyncPlan(); fillSettings(r.settings); $('#sync-status').textContent = `Imported ${r.modules} module configurations and ${r.profiles} profiles. They apply next game launch.`;
}));
$('#sync-restore').addEventListener('click', () => syncAction(async () => {
  if (!confirm('Restore module settings from before the last preference import? Imported named profiles and launcher preferences are kept.')) return;
  await api.syncRestore(); invalidateSyncPlan(); $('#sync-status').textContent = 'Previous module setup restored. Applies next game launch.';
}));
$('#capture-replay-enabled').addEventListener('change', async () => {
  const checkbox = $('#capture-replay-enabled'); checkbox.disabled = true;
  try { fillSettings(await api.saveSettings({ mods: { replaymod: checkbox.checked } })); toast('Replay selection saved for the next launch.'); }
  catch (error) { checkbox.checked = Boolean(state.settings?.mods?.replaymod); toast(error.message, { error: true }); }
  finally { checkbox.disabled = Boolean(state.instances.find(i => i.id === state.activeInstanceId)?.pack); }
});
$('#capture-replays').addEventListener('click', async () => { try { await api.captureFolder(); } catch (error) { toast(error.message, { error: true }); } });
function renderChannelStatus() {
  const chosen = state.settings?.updateChannel || 'stable', active = state.activeUpdateChannel || 'stable';
  $('#update-channel-status').textContent = chosen === active ? `Active channel: ${active === 'preview' ? 'Preview (beta and stable releases)' : 'Stable'}.` : `Saved channel: ${chosen}. Close and reopen Sloth Client to activate it. This session still uses ${active}.`;
}
$('#update-channel-save').addEventListener('click', async () => {
  const button = $('#update-channel-save'); button.disabled = true;
  try {
    const channel = $('#update-channel').value;
    if (channel === 'preview' && !confirm('Enable preview releases? Beta features may have bugs. Close and reopen Sloth Client to activate the channel.')) return;
    fillSettings(await api.saveSettings({ updateChannel: channel })); renderChannelStatus();
  } catch (error) { toast(error.message, { error: true }); }
  finally { button.disabled = false; }
});
quickActions.push({ label: 'Client Studio: in-game tools, preference sync and capture controls', run: () => showPage('experience') });

// ---------- updates ----------
let launcherUpdateMode = null;
function renderUpdate(update) {
  if (!update) return;
  launcherUpdateMode = update.state;
  if (update.notes) $('#update-release-notes').textContent = update.notes;
  const text = {
    dev: 'Development build: updates are off.',
    recovery: 'Recovered launcher: updates are paused. Your normally installed launcher is still available.',
    unconfigured: 'Online updates are not connected yet. For now, install the latest Sloth setup file provided to you. Your installed launcher cannot discover new builds until a release repository is configured.',
    checking: 'Checking for updates…',
    current: 'You have the latest launcher.',
    downloading: `Downloading update${update.version ? ` ${update.version}` : ''}${update.percent ? ` (${update.percent}%)` : ''}…`,
    ready: `Version ${update.version} is ready to install.`,
    'development-ready': `Version ${update.version} is downloaded and verified by Sloth. Windows publisher signing is pending.`,
    manual: update.message || 'This release requires a manual download.',
    cancelled: update.message || 'Update download cancelled. Check again to retry.',
    error: update.message || 'Could not check for updates.'
  }[update.state];
  if (text) $('#update-status').textContent = text;
  if (text) $('#update-page-status').textContent = text;
  $('#update-state-label').textContent = { recovery: 'RECOVERED VERSION', dev: 'DEVELOPMENT BUILD', unconfigured: 'MANUAL UPDATE', manual: 'MANUAL DOWNLOAD', checking: 'CHECKING', current: 'UP TO DATE', downloading: 'DOWNLOADING', ready: 'READY TO INSTALL', 'development-ready': 'READY TO INSTALL', cancelled:'CANCELLED',error: 'CHECK FAILED' }[update.state] || 'NOT CHECKED';
  const busy = ['checking', 'downloading', 'ready', 'development-ready'].includes(update.state);
  $('#update-page-check').disabled = busy;
  $('#check-update').disabled = busy;
  $('#update-page-install').hidden = !['ready', 'development-ready', 'manual'].includes(update.state);
  $('#update-page-install').textContent = update.state === 'manual' ? 'Open Sloth download' : 'Install and restart';
  $('#update-download-progress').hidden = update.state !== 'downloading';
  $('#update-download-progress').value = Math.max(0, Math.min(100, Number(update.percent) || 0));
  $('#update-card').hidden = !['ready', 'development-ready'].includes(update.state);
  if (['ready', 'development-ready'].includes(update.state)) $('#update-text').textContent = `Sloth Client ${update.version} is downloaded. Close Minecraft, then install and restart.${update.state === 'development-ready' ? ' Sloth signature verified; Windows publisher signing pending.' : ''}`;
}
api.onUpdate(renderUpdate);
async function checkLauncherUpdate() {
  renderUpdate({ state: 'checking' });
  try { await api.checkUpdate(); } catch (err) { renderUpdate({ state: 'error', message: err.message }); }
}
async function installLauncherUpdate() {
  $('#update-page-install').disabled = true; $('#install-update').disabled = true;
  $('#update-page-status').textContent = launcherUpdateMode === 'manual' ? 'Opening the Sloth download page…' : 'Preserving your current launcher before updating…';
  try { await api.installUpdate(); if (launcherUpdateMode === 'manual') $('#update-page-status').textContent = 'Sloth release opened in your browser. Download the setup file, then close Minecraft and the client before installing.'; } catch (err) { toast(err.message, { error: true }); $('#update-page-status').textContent = err.message; }
  finally { $('#update-page-install').disabled = false; $('#install-update').disabled = false; }
}
$('#check-update').addEventListener('click', () => { showPage('updates'); checkLauncherUpdate(); });
$('#update-page-check').addEventListener('click', checkLauncherUpdate);
$('#install-update').addEventListener('click', installLauncherUpdate);
$('#update-page-install').addEventListener('click', installLauncherUpdate);

// ---------- browse (Modrinth) ----------
const browse = { loaded: false, offset: 0, total: 0, categories: [], installedView: false, installedIds: new Set(), busy: false };

const number = n => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n));
function ago(iso) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  if (!Number.isFinite(days)) return '';
  if (days < 1) return 'today';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months === 1 ? '' : 's'} ago` : `${Math.floor(months / 12)} year${months < 24 ? '' : 's'} ago`;
}

function projectIcon(url, title) {
  if (url) { const img = el('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }); img.src = url; return img; }
  return el('div', { class: 'ph', text: (title || '?')[0].toUpperCase() });
}

async function refreshInstalled() {
  try {
    const list = await api.browseInstalled();
    browse.installedIds = new Set(list.mods.map(m => m.id));
    return list;
  } catch { return { mods: [], resourcepacks: [], shaderpacks: [] }; }
}

async function browseSearch(reset = false) {
  if (browse.busy) { if (reset) browse.pendingReset = true; return; }
  browse.busy = true;
  browse.pendingReset = false;
  const results = $('#browse-results');
  if (reset) { browse.offset = 0; results.replaceChildren(el('div', { class: 'browse-empty', text: 'Searching Modrinth…' })); }
  try {
    const type = $('#browse-type').value;
    $('#browse-loader-label').textContent = type === 'datapack' ? 'Data pack' : type === 'shader' ? 'Iris' : type === 'resourcepack' ? 'Minecraft' : 'Fabric';
    $('#browse-version-label').textContent = state.gameVersion;
    $('#browse-content-note').textContent = type === 'modpack' ? 'Fabric packs for Minecraft '+state.gameVersion+'. Review a pack to install it in a separate instance.' : type === 'datapack' ? 'Data packs belong to a world. Open a project for its download and world installation instructions.' : '';
    if (reset) await Promise.all([loadCategories(type), refreshInstalled()]);
    const res = await api.browseSearch({ query: $('#browse-query').value, type, sort: $('#browse-sort').value, categories: browse.categories, offset: browse.offset });
    if (browse.pendingReset || type !== $('#browse-type').value) return;
    if (reset) results.replaceChildren();
    browse.total = res.total;
    browse.offset += res.hits.length;
    for (const hit of res.hits) results.append(resultRow(hit, type));
    if (!results.children.length) results.append(el('div', { class: 'browse-empty', text: `Nothing found for Minecraft ${state.gameVersion}. Try other words or clear the categories.` }));
    $('#browse-more').hidden = browse.offset >= browse.total;
    browse.loaded = true;
  } catch (err) {
    if (!browse.pendingReset) results.replaceChildren(el('div', { class: 'browse-empty', text: `Couldn't reach Modrinth: ${err.message}` }));
  } finally {
    browse.busy = false;
    if (browse.pendingReset) browseSearch(true);
  }
}

function resultRow(hit, type) {
  const externalInstall = type === 'datapack';
  const packInstance=Boolean(state.instances.find(i=>i.id===state.activeInstanceId)?.pack);
  // Mods that ship with the Sloth pack are toggled on the Sloth Client page, not installed twice.
  const packed = type === 'mod' && !packInstance && (state.requiredMods.includes(hit.slug) || Boolean(state.settings.mods[hit.slug]));
  const installed = type === 'mod' && browse.installedIds.has(hit.id);
  const done = packed || installed;
  const button = el('button', { class: `install-button${done ? ' done' : ''}`, text: packed ? '✓ In Sloth pack' : installed ? '✓ Installed' : type==='modpack'?'Review & install': externalInstall ? '⬇ Get pack ↗' : '⬇ Install' });
  const serverOnly=hit.compatibility?.client==='unsupported';
  button.disabled = done||serverOnly;if(serverOnly)button.textContent='Server only';
  button.addEventListener('click', async () => {
    if(type==='modpack'){button.disabled=true;button.textContent='Preparing review…';try{await openModpackReview(await api.modpackReview(hit.id),button);}catch(e){toast(e.message,{error:true});}finally{button.disabled=false;button.textContent='Review & install';}return;}
    if (externalInstall) { try { await api.openProject({ slug: hit.slug, type }); } catch (err) { toast(err.message, { error: true }); } return; }
    button.disabled = true;
    button.textContent = 'Installing…';
    try {
      const result = await api.browseInstall({ id: hit.id, type });
      if (result.settings) fillSettings(result.settings);
      button.textContent = '✓ Installed';
      button.classList.add('done');
      const extra = result.installed.length > 1 ? ` (+${result.installed.length - 1} required)` : '';
      const inPack = type === 'mod' && !result.installed.length;
      toast(type === 'shader' ? `${hit.title} installed and Iris turned on. Pick it in Options > Video > Shader Packs.`
        : type === 'resourcepack' ? `${hit.title} installed. Turn it on in Options > Resource Packs.`
        : inPack ? `${hit.title} is part of the Sloth pack, so it's been switched on in Sloth Client.`
        : `${hit.title} installed${extra}. It loads next time you play.`);
      refreshInstalled();
    } catch (err) {
      button.disabled = false;
      button.textContent = '⬇ Install';
      toast(err.message, { error: true });
    }
  });
  const view = el('button', { class: 'tool-button', text: '👁 View', onclick: () => api.openProject({ slug: hit.slug, type }) });
  const favorite = el('button', { class: 'tool-button shelf-save', 'data-project': hit.id, 'data-type': type, text: isSaved(hit.id, type) ? '★ Saved' : '☆ Save', onclick: async () => {
    favorite.disabled = true;
    try { state.savedProjects = await api.shelfToggle({ ...hit, type }); syncShelfButtons(); if ($('#page-saved').classList.contains('active')) renderSavedShelf(); }
    catch (e) { toast(e.message, { error: true }); }
    finally { favorite.disabled = false; }
  } });
  return el('div', { class: 'browse-row' }, [
    projectIcon(hit.icon, hit.title),
    el('div', {}, [
      el('h3', {}, [document.createTextNode(hit.title)]),
      el('span',{class:'compatibility-label '+(serverOnly?'compatibility-warning':''),text:serverOnly?'Server only':hit.compatibility?hit.compatibility.gameVersion+' listed · '+hit.compatibility.loader:'Version checked before installation'}),
      el('p', { text: hit.description }),
      el('div', { class: 'browse-tags' }, [el('span', { class: 'browse-author', text: hit.author || 'Community project' }), el('span', { text: type === 'datapack' ? 'Data pack' : type === 'shader' ? 'Iris' : type === 'resourcepack' ? 'Minecraft' : 'Fabric' }), ...hit.categories.map(c => el('span', { text: c }))])
    ]),
    el('div', { class: 'browse-side' }, [
      el('div', { class: 'browse-meta', text: hit.updated ? `⬇ ${number(hit.downloads)}  •  ${ago(hit.updated)}` : 'Saved for later' }),
      el('div', { class: 'browse-actions' }, [favorite, view, button])
    ])
  ]);
}

async function loadCategories(type) {
  const box = $('#browse-categories');
  let names = [];
  try { names = await api.browseCategories(type); } catch { /* offline */ }
  browse.categories = browse.categories.filter(c => names.includes(c));
  box.replaceChildren(...names.map(name => {
    const b = el('button', { text: name.replace(/-/g, ' '), title: name.replace(/-/g, ' '), class: browse.categories.includes(name) ? 'on' : '' });
    b.addEventListener('click', () => {
      browse.categories = browse.categories.includes(name) ? browse.categories.filter(c => c !== name) : [...browse.categories, name];
      b.classList.toggle('on');
      browseSearch(true);
    });
    return b;
  }));
  box.classList.toggle('categories-expanded', browse.categoriesExpanded === true);
  $('#browse-category-toggle').hidden = names.length <= 12;
}

async function showInstalled() {
  const list = await refreshInstalled();
  const results = $('#browse-results');
  $('#browse-more').hidden = true;
  const rows = list.mods.map(m => el('div', { class: 'browse-row' }, [
    projectIcon(m.icon, m.title),
    el('div', {}, [el('h3', {}, [document.createTextNode(m.title), el('small', { text: m.source === 'import' ? 'imported' : 'from Browse' })]), el('p', { text: m.filename })]),
    el('div', { class: 'browse-side' }, [el('button', { class: 'tool-button', text: 'Remove', onclick: async () => {
      if (!confirm(`Remove ${m.title}?`)) return;
      await api.browseRemove(m.id);
      toast(`${m.title} removed.`);
      showInstalled();
    } })])
  ]));
  const packs = [...list.resourcepacks.map(p => `Resource pack: ${p}`), ...list.shaderpacks.map(p => `Shader: ${p}`)];
  results.replaceChildren(
    ...(rows.length ? rows : [el('div', { class: 'browse-empty', text: 'No mods added yet. Find some with the search above.' })]),
    ...(packs.length ? [el('div', { class: 'browse-empty', text: packs.join('  •  ') })] : [])
  );
}

let browseTimer;
$('#browse-query').addEventListener('input', () => { clearTimeout(browseTimer); browseTimer = setTimeout(() => { browse.installedView = false; browseSearch(true); }, 350); });
$('#browse-type').addEventListener('change', () => { browse.categories = []; browse.installedView = false; browseSearch(true); });
for (const button of document.querySelectorAll('[data-browse-type]')) button.addEventListener('click', () => {
  $('#browse-type').value = button.dataset.browseType;
  $('#browse-type-label').textContent = $('#browse-type').selectedOptions[0].textContent;
  for (const item of document.querySelectorAll('[data-browse-type]')) item.querySelector('span').textContent = item === button ? '✓' : '';
  $('#browse-type-menu').open = false;
  $('#browse-type').dispatchEvent(new Event('change'));
  $('#browse-type-menu summary').focus();
});
document.addEventListener('click', event => { if (!$('#browse-type-menu').contains(event.target)) $('#browse-type-menu').open = false; });
$('#browse-type-menu').addEventListener('keydown', event => { if (event.key === 'Escape') { $('#browse-type-menu').open = false; $('#browse-type-menu summary').focus(); } });
$('#browse-category-toggle').addEventListener('click', () => {
  browse.categoriesExpanded = !browse.categoriesExpanded;
  $('#browse-categories').classList.toggle('categories-expanded', browse.categoriesExpanded);
  $('#browse-category-toggle').textContent = browse.categoriesExpanded ? 'View less' : 'View more';
});
$('#browse-sort').addEventListener('change', () => browseSearch(true));
$('#browse-more').addEventListener('click', () => browseSearch(false));
$('#browse-installed-toggle').addEventListener('click', () => {
  browse.installedView = !browse.installedView;
  $('#browse-installed-toggle').textContent = browse.installedView ? 'Back to search' : 'Installed';
  if (browse.installedView) showInstalled(); else browseSearch(true);
});

// ---------- screenshots ----------
let shotsOffset = 0, shotsGeneration = 0, shotAlbums = {};
async function loadShots() {
  const generation = ++shotsGeneration, instanceId = state.activeInstanceId;
  const grid = $('#shots-grid');
  $('#shots-pagination')?.remove();
  grid.replaceChildren(el('div', { class: 'browse-empty', text: 'Loading screenshots…' }));
  let result, albums;
  try { albums = await api.shotAlbums().catch(e=>{if(generation===shotsGeneration){$('#shots-album-filter').value='';toast(`Album labels unavailable: ${e.message}`,{error:true});}return {};}); result = await api.screenshots({ album: $('#shots-album-filter').value, query: $('#shots-query').value, date: $('#shots-date').value, sort: $('#shots-sort').value, offset: shotsOffset, limit: 24 }); }
  catch (e) { if (generation === shotsGeneration) grid.replaceChildren(el('p', { text: e.message })); return; }
  if (generation !== shotsGeneration || instanceId !== state.activeInstanceId) return;
  shotAlbums = albums;
  if (!result.items.length && result.total > 0 && shotsOffset > 0) { shotsOffset = Math.floor((result.total - 1) / 24) * 24; return loadShots(); }
  const selectedAlbum=$('#shots-album-filter').value;
  const albumNames=[...new Set(Object.values(shotAlbums).filter(a=>typeof a==='string'&&/^[A-Za-z0-9 _-]{1,40}$/.test(a)))].sort();
  $('#shots-album-filter').replaceChildren(el('option',{value:'',text:'All albums'}),...albumNames.map(a=>el('option',{value:a,text:a})));
  if(albumNames.includes(selectedAlbum))$('#shots-album-filter').value=selectedAlbum;
  const shots = result.items;
  $('#shots-count').textContent = `${result.total} matching screenshots${result.total ? ` · ${result.offset + 1}–${result.offset + shots.length}` : ''}. Scans up to 10,000 files in the active instance.`;
  grid.replaceChildren(...(shots.length ? shots.map(s => {
    const fig = el('figure', { class: 'shot' });
    if (s.thumb) { const img = el('img', { alt: s.name }); img.src = s.thumb; fig.append(img); }
    else fig.append(el('div', { class: 'shot-placeholder', text: 'Preview unavailable · Open the original' }));
    fig.append(el('figcaption', {}, [
      el('span', { text: `${s.name} · ${new Date(s.taken).toLocaleString()}` }),
      el('span', {}, [
        el('button', { text: 'Open', onclick: async () => { try { await api.screenshotOpen(s.name); } catch (e) { toast(e.message, { error: true }); } } }),
        el('button', { text: 'Edit', onclick: () => openShotEditor(s.name) }),
        el('button', { text: shotAlbums[s.name] ? `Album: ${shotAlbums[s.name]}` : 'Add to album', onclick: () => openAlbumDialog(s.name) }),
        el('button', { text: 'Export', onclick: async () => { try { if (await api.screenshotExport(s.name)) toast('Screenshot copy exported.'); } catch (e) { toast(e.message, { error: true }); } } }),
        el('button', { class: 'danger', text: 'Delete', onclick: async () => {
          if (!confirm(`Move ${s.name} to the Recycle Bin?`)) return;
          try { await api.screenshotDelete(s.name); await loadShots(); } catch (e) { toast(e.message, { error: true }); }
        } })
      ])
    ]));
    return fig;
  }) : [el('div', { class: 'browse-empty', text: 'No matching screenshots. Clear the filters or press F2 in game to take one.' })]));
  $('#shots-pagination')?.remove();
  const previous = el('button', { class: 'tool-button', text: '← Previous', onclick: () => { shotsOffset = Math.max(0, shotsOffset - 24); loadShots(); } }); previous.disabled = result.offset === 0;
  const next = el('button', { class: 'tool-button', text: 'Next →', onclick: () => { shotsOffset += 24; loadShots(); } }); next.disabled = result.offset + shots.length >= result.total;
  grid.after(el('div', { class: 'log-toolbar', id: 'shots-pagination' }, [previous, next]));
}
$('#shots-refresh').addEventListener('click', loadShots);
let shotsSearchTimer;
$('#shots-query').addEventListener('input', () => { clearTimeout(shotsSearchTimer); shotsOffset = 0; shotsSearchTimer = setTimeout(loadShots, 250); });
for (const id of ['shots-date', 'shots-sort', 'shots-album-filter']) $(`#${id}`).addEventListener('change', () => { shotsOffset = 0; loadShots(); });

const albumEditor={name:'',instanceId:'',busy:false};
function openAlbumDialog(name){
  albumEditor.name=name;albumEditor.instanceId=state.activeInstanceId;
  $('#shot-album-file').textContent=name;$('#shot-album-name').value=shotAlbums[name]||'';$('#shot-album-status').textContent='';
  $('#shot-album-dialog').showModal();$('#shot-album-name').focus();
}
function closeAlbumDialog(event){event?.preventDefault();if(!albumEditor.busy)$('#shot-album-dialog').close();}
$('#shot-album-cancel').addEventListener('click',closeAlbumDialog);
$('#shot-album-dialog').addEventListener('cancel',closeAlbumDialog);
async function saveAlbumLabel(){
  if(albumEditor.busy)return;
  const album=$('#shot-album-name').value.trim();
  if(album&&!/^[A-Za-z0-9 _-]{1,40}$/.test(album)){$('#shot-album-status').textContent='Use 1–40 letters, numbers, spaces, - or _.';return;}
  albumEditor.busy=true;$('#shot-album-save').disabled=true;$('#shot-album-name').disabled=true;
  try {
    if(albumEditor.instanceId!==state.activeInstanceId)throw new Error('The active instance changed. Cancel and reopen this screenshot.');
    await api.shotAlbum({name:albumEditor.name,album,instanceId:albumEditor.instanceId});$('#shot-album-dialog').close();await loadShots();toast(album?'Album label saved.':'Album label removed.');
  }catch(e){$('#shot-album-status').textContent=e.message;}
  finally{albumEditor.busy=false;$('#shot-album-save').disabled=false;$('#shot-album-name').disabled=false;}
}
$('#shot-album-save').addEventListener('click',saveAlbumLabel);
$('#shot-album-name').addEventListener('keydown',e=>{if(e.key==='Enter')saveAlbumLabel();});

// Local capture editing. The main process validates dimensions and writes a new file.
const capture = { name: '', album: '', original: '', undo: [], dirty: false, busy: false, drag: null, crop: null, generation: 0, instanceId: '' };
const captureCanvas = $('#shot-edit-canvas'), captureDialog = $('#shot-editor');
const captureSelection = el('div', { class: 'capture-selection', 'aria-hidden': 'true' });
captureCanvas.parentElement.append(captureSelection);
const captureContext = () => captureCanvas.getContext('2d');
function captureStatus(message) { $('#shot-edit-status').textContent = message; }
function captureControls() {
  for (const id of ['shot-edit-save','shot-edit-reset','shot-edit-tool','shot-edit-color','shot-edit-width','shot-edit-text']) $(`#${id}`).disabled = capture.busy;
  $('#shot-edit-undo').disabled = capture.busy || !capture.undo.length;
  $('#shot-edit-crop').disabled = capture.busy || !capture.crop;
}
function showCrop() {
  const r=capture.crop;
  captureSelection.hidden = !r;
  if(!r)return;
  for(const [id,value] of [['x',r.x],['y',r.y],['w',r.width],['h',r.height]])$(`#shot-crop-${id}`).value=value;
  const bounds=captureCanvas.getBoundingClientRect(), parent=captureCanvas.parentElement.getBoundingClientRect();
  const sx=bounds.width/captureCanvas.width, sy=bounds.height/captureCanvas.height;
  Object.assign(captureSelection.style,{left:`${bounds.left-parent.left+r.x*sx}px`,top:`${bounds.top-parent.top+r.y*sy}px`,width:`${r.width*sx}px`,height:`${r.height*sy}px`});
}
new ResizeObserver(showCrop).observe(captureCanvas);
function clearCrop() { capture.crop=null; showCrop(); captureControls(); }
function captureImage(data) {
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not read this image.'));image.src=data;});
}
function drawCapture(image) { captureCanvas.width=image.naturalWidth;captureCanvas.height=image.naturalHeight;captureContext().drawImage(image,0,0);clearCrop();$('#shot-crop-x').value=0;$('#shot-crop-y').value=0;$('#shot-crop-w').value=captureCanvas.width;$('#shot-crop-h').value=captureCanvas.height; }
$('#shot-crop-select').addEventListener('click',()=>{
  if(capture.busy||capture.drag)return;
  const number=id=>Math.floor(Number($(`#shot-crop-${id}`).value));
  const x=number('x'),y=number('y'),width=number('w'),height=number('h');
  if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<2||height<2||x+width>captureCanvas.width||y+height>captureCanvas.height){captureStatus('Choose a rectangle of at least 2 × 2 pixels entirely inside the image.');return;}
  $('#shot-edit-tool').value='crop';capture.crop={x,y,width,height};showCrop();captureControls();captureStatus('Rectangle selected. Apply crop to use it.');
});
function rememberCapture() {
  const data=captureCanvas.toDataURL('image/png');
  // Retain at most eight steps and 48 MB of compressed undo data.
  capture.undo.push(data);
  while(capture.undo.length>8 || capture.undo.reduce((size,item)=>size+item.length*2,0)>48*1024*1024)capture.undo.shift();
  capture.dirty=true;captureControls();
}
async function openShotEditor(name) {
  const generation=++capture.generation, instanceId=state.activeInstanceId;
  capture.busy=true;captureControls();
  try {
    const source=await api.shotEditLoad(name);
    const image=await captureImage(source.data);
    if(generation!==capture.generation||instanceId!==state.activeInstanceId||source.instanceId!==instanceId)return;
    Object.assign(capture,{instanceId,name:source.name,album:source.album,original:source.data,undo:[],dirty:false,drag:null,crop:null});
    drawCapture(image);
    $('#shot-editor-title').textContent=`${source.name} · ${source.width} × ${source.height} · Original preserved`;
    captureStatus('Drag to select a crop. Draw or click to place annotation text. Save creates a new PNG.');
    captureDialog.showModal();
  } catch(e){toast(e.message,{error:true});}
  finally{if(generation===capture.generation){capture.busy=false;captureControls();}}
}
function closeCapture(event) {
  event?.preventDefault();
  if(capture.busy){captureStatus('Please wait for the current operation.');return;}
  if(capture.dirty&&!confirm('Discard unsaved screenshot edits?'))return;
  capture.generation++;captureDialog.close();capture.undo=[];capture.original='';capture.name='';capture.drag=null;
  captureCanvas.width=1;captureCanvas.height=1;clearCrop();
}
$('#shot-editor-close').addEventListener('click',closeCapture);
captureDialog.addEventListener('cancel',closeCapture);
$('#shot-edit-tool').addEventListener('change',clearCrop);
function capturePoint(event) {
  const r=captureCanvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(captureCanvas.width,(event.clientX-r.left)*captureCanvas.width/r.width)),y:Math.max(0,Math.min(captureCanvas.height,(event.clientY-r.top)*captureCanvas.height/r.height))};
}
captureCanvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||capture.busy||capture.drag)return;
  const point=capturePoint(event),tool=$('#shot-edit-tool').value,ctx=captureContext();
  clearCrop();
  if(tool==='text'){
    const text=$('#shot-edit-text').value.trim().slice(0,120);
    if(!text){captureStatus('Enter an annotation, then click where it should appear.');return;}
    rememberCapture();ctx.font=`${Math.max(16,Math.round(captureCanvas.width/55))}px sans-serif`;ctx.fillStyle=$('#shot-edit-color').value;
    ctx.textBaseline='top';ctx.fillText(text,point.x,point.y,Math.max(1,captureCanvas.width-point.x));captureStatus('Annotation placed. Undo removes it.');return;
  }
  if(tool==='pen'){
    rememberCapture();ctx.strokeStyle=$('#shot-edit-color').value;ctx.lineWidth=Math.max(1,Math.min(32,Number($('#shot-edit-width').value)||4));ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(point.x+.01,point.y+.01);ctx.stroke();
  }
  capture.drag={...point,tool,pointer:event.pointerId};captureCanvas.setPointerCapture(event.pointerId);
});
captureCanvas.addEventListener('pointermove',event=>{
  const d=capture.drag;if(!d||d.pointer!==event.pointerId)return;
  const p=capturePoint(event);
  if(d.tool==='pen'){const ctx=captureContext();ctx.lineTo(p.x,p.y);ctx.stroke();}
  else {const x=Math.floor(Math.min(d.x,p.x)),y=Math.floor(Math.min(d.y,p.y));capture.crop={x,y,width:Math.min(captureCanvas.width-x,Math.ceil(Math.abs(p.x-d.x))),height:Math.min(captureCanvas.height-y,Math.ceil(Math.abs(p.y-d.y)))};showCrop();}
});
function finishCaptureDrag(event){if(!capture.drag||capture.drag.pointer!==event.pointerId)return;capture.drag=null;if(capture.crop&&(capture.crop.width<2||capture.crop.height<2))clearCrop();if(captureCanvas.hasPointerCapture(event.pointerId))captureCanvas.releasePointerCapture(event.pointerId);captureControls();}
captureCanvas.addEventListener('pointerup',finishCaptureDrag);captureCanvas.addEventListener('pointercancel',finishCaptureDrag);
$('#shot-edit-crop').addEventListener('click',()=>{
  if(!capture.crop||capture.busy||capture.drag)return;
  const r=capture.crop;rememberCapture();
  const copy=document.createElement('canvas');copy.width=r.width;copy.height=r.height;copy.getContext('2d').drawImage(captureCanvas,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
  captureCanvas.width=r.width;captureCanvas.height=r.height;captureContext().drawImage(copy,0,0);copy.width=copy.height=1;clearCrop();captureStatus(`Cropped to ${r.width} × ${r.height}. Save creates a new copy.`);
});
async function restoreCapture(reset) {
  if(capture.busy||capture.drag||(!reset&&!capture.undo.length))return;
  capture.busy=true;captureControls();
  try{const image=await captureImage(reset?capture.original:capture.undo.at(-1));drawCapture(image);if(reset){capture.undo=[];capture.dirty=false;}else{capture.undo.pop();capture.dirty=true;}captureStatus(reset?'Original restored.':'Last edit undone.');}
  catch(e){captureStatus(e.message);}finally{capture.busy=false;captureControls();}
}
$('#shot-edit-undo').addEventListener('click',()=>restoreCapture(false));
$('#shot-edit-reset').addEventListener('click',()=>{if(!capture.dirty||confirm('Reset to the original image?'))restoreCapture(true);});
$('#shot-edit-save').addEventListener('click',async()=>{
  if(capture.busy||capture.drag)return;
  capture.busy=true;captureControls();
  try {
    if(capture.instanceId!==state.activeInstanceId)throw new Error('The active instance changed. Close the editor and reopen this screenshot.');
    const saved=await api.shotEditSave({instanceId:capture.instanceId,name:capture.name,data:captureCanvas.toDataURL('image/png')});
    let albumNote='';
    if(capture.album)try{await api.shotAlbum({instanceId:capture.instanceId,name:saved.name,album:capture.album});}catch(e){albumNote=` Album assignment failed: ${e.message}`;}
    capture.dirty=false;captureStatus(`Saved ${saved.name}.${albumNote}`);toast('Edited screenshot saved as a new copy.');await loadShots();
  }catch(e){captureStatus(e.message);toast(e.message,{error:true});}
  finally{capture.busy=false;captureControls();}
});

let assetGeneration=0;
async function inspectPackAsset() {
  const generation=++assetGeneration, result=$('#pack-asset-result');result.textContent='Inspecting selected packs…';
  try {
    const data=await api.packAsset($('#pack-asset-path').value.trim());if(generation!==assetGeneration)return;
    result.replaceChildren(el('h3',{text:data.winner?`Highest inspected file match: ${data.winner}`:'No inspected file pack supplies this exact path.'}),
      el('p',{class:'field-help',text:data.asset}),
      ...data.packs.map(pack=>el('div',{class:'asset-provider'},[
        el('strong',{text:`${pack.priority}. ${pack.name}`}),
        el('p',{class:'field-help',text:pack.unreadable?'Inspection unavailable':pack.directory?'Folder pack · exact file lookup':`${pack.assets||0} assets · ${pack.fonts||0} font files · ${pack.items||0} item textures · ${pack.gui||0} GUI textures`}),
        el('p',{class:'field-help',text:[pack.unreadable?'Could not inspect this pack':data.providers.some(p=>p.name===pack.name)?'Contains this file':'Does not contain this file',...(pack.issues||[])].join(' · ')})
      ])),el('p',{class:'field-help',text:data.note+(data.limited?' Limited to the last 30 selected file packs.':'')}));
  }catch(e){if(generation===assetGeneration)result.textContent=e.message;}
}
$('#pack-asset-inspect').addEventListener('click',inspectPackAsset);
$('#pack-asset-path').addEventListener('keydown',e=>{if(e.key==='Enter')inspectPackAsset();});
$('#pack-asset-font').addEventListener('click',()=>{$('#pack-asset-path').value='assets/minecraft/font/default.json';inspectPackAsset();});
$('#pack-asset-tool').addEventListener('click',()=>{$('#pack-asset-path').value='assets/minecraft/textures/item/diamond_pickaxe.png';inspectPackAsset();});

// ---------- import ----------
let importToken = null;
async function loadImportSources() {
  const select = $('#import-source');
  if (select.dataset.loaded) return;
  select.dataset.loaded = '1';
  const sources = await api.importSources().catch(() => []);
  for (const s of sources) select.append(el('option', { value: s.token, text: s.name }));
  if (!sources.length) select.append(el('option', { value: '', text: 'No other launchers found' }));
}

async function scanImport(token, label) {
  importToken = token;
  const box = $('#import-scan');
  $('#import-status').textContent = `Looking inside ${label}…`;
  try {
    const scan = await api.importScan(token);
    const option = (key, text, count, enabled = count > 0) => {
      const input = el('input', { type: 'checkbox' });
      input.checked = enabled;
      input.disabled = !enabled;
      input.dataset.key = key;
      return el('label', { class: enabled ? '' : 'off' }, [input, el('span', { text: `${text} (${count})` })]);
    };
    const worlds = scan.worlds.map(w => {
      const input = el('input', { type: 'checkbox' });
      input.dataset.world = w.folder;
      input.disabled = !w.compatible;
      return el('label', { class: w.compatible ? '' : 'off' }, [input, el('span', { text: `World: ${w.title} (${w.version})${w.compatible ? '' : ` — newer than ${state.gameVersion}, can't be opened`}` })]);
    });
    const run = el('button', { class: 'save-button', text: 'IMPORT →' });
    run.addEventListener('click', async () => {
      const choices = { worlds: [] };
      for (const input of box.querySelectorAll('input')) {
        if (input.dataset.key) choices[input.dataset.key] = input.checked;
        if (input.dataset.world && input.checked) choices.worlds.push(input.dataset.world);
      }
      run.disabled = true;
      try {
        const report = await api.importRun({ token: importToken, choices });
        if (report.settings) fillSettings(report.settings);
        const parts = [`${report.screenshots} screenshots`, `${report.resourcepacks.length} resource packs`, `${report.shaderpacks.length} shaders`, `${report.worlds.length} worlds`, `${report.mods.length + report.enableCatalog.length} mods`];
        $('#import-status').textContent = `Imported ${parts.join(', ')}.${report.unmatched.length ? ` Not available for ${state.gameVersion}: ${report.unmatched.join(', ')}.` : ''}`;
        toast('Import finished.');
      } catch (err) {
        $('#import-status').textContent = err.message;
      } finally {
        run.disabled = false;
      }
    });
    box.replaceChildren(el('div', { class: 'import-list' }, [
      option('screenshots', 'Screenshots', scan.screenshots),
      option('resourcepacks', 'Resource packs', scan.resourcepacks.length),
      option('shaderpacks', 'Shader packs', scan.shaderpacks.length),
      option('mods', `Mods, re-downloaded for ${state.gameVersion} from Modrinth`, scan.mods.length),
      ...worlds,
      run
    ]));
    box.hidden = false;
    $('#import-status').textContent = `Found in ${label}. Pick what to bring over; nothing already in Sloth gets overwritten.`;
  } catch (err) {
    $('#import-status').textContent = err.message;
  }
}

$('#import-source').addEventListener('change', event => { if (event.target.value) scanImport(event.target.value, event.target.selectedOptions[0].textContent); });
$('#import-folder').addEventListener('click', async () => { const s = await api.importPick('folder'); if (s) scanImport(s.token, s.name); });
$('#import-zip').addEventListener('click', async () => { const s = await api.importPick('zip'); if (s) scanImport(s.token, s.name); });
api.onImportProgress(msg => { $('#import-status').textContent = msg; });

// ---------- start ----------
(async () => {
  const boot = await api.bootstrap();
  state.activeUpdateChannel = boot.activeUpdateChannel || 'stable';
  renderChannelStatus();
  state.accounts = boot.accounts;
  state.catalog = boot.catalog;
  state.memory = boot.memory;
  state.game = boot.game;
  state.accents = boot.accents || {};
  state.gameVersion = boot.gameVersion;
  state.requiredMods = boot.requiredMods;
  state.instances = boot.instances || [];
  state.activeInstanceId = boot.activeInstanceId || 'sloth';
  $('#app-version').textContent = boot.appVersion;
  $('#update-installed-version').textContent = `Sloth ${boot.appVersion}`;
  $('#hero-version').textContent = boot.gameVersion;
  $('#setup-game').textContent = boot.gameVersion;

  $('#client-missing').hidden = boot.hasClientMod;
  $('#setup-client').textContent = boot.hasClientMod ? 'BUNDLED' : 'NOT BUILT';
  $('#setup-client-check').className = `setup-check ${boot.hasClientMod ? 'done' : 'warn'}`;
  $('#setup-client-check').textContent = boot.hasClientMod ? '✓' : '!';
  $('#setup-tag').textContent = boot.hasClientMod ? 'READY' : 'CHECK';
  $('#setup-tag').classList.toggle('good', boot.hasClientMod);
  if (!boot.canPersistAccounts) $('#account-note').textContent = "Windows credential protection isn't available, so you'll need to sign in each time you open the launcher.";
  fillSettings(boot.settings);
  renderInstances();
  renderAccounts();
  renderUpdate(boot.update);
  loadReadiness();
  appendLog(await api.gameLog(), true);
  await new Promise(resolve=>setTimeout(resolve,0));
  if(!rendererStartupFault)await api.rendererReady();
})();

let packReview=null,packWorking=false,packFocus=null;
async function openModpackReview(preview,focus){if(!preview)return;packReview=preview;packFocus=focus||document.activeElement;$('#modpack-title').textContent=preview.name;$('#modpack-detail').textContent='Minecraft '+preview.gameVersion+' · '+preview.version;$('#modpack-compatibility').textContent=preview.reason;$('#modpack-compatibility').classList.toggle('compatibility-warning',!preview.compatible);$('#modpack-size').textContent=preview.clientFiles+' client files · '+mb(preview.totalBytes)+' estimated download and overrides';$('#modpack-optional-label').hidden=!preview.optionalFiles;$('#modpack-optional-label').lastChild.textContent=' Include '+preview.optionalFiles+' optional client files';$('#modpack-optional').checked=true;$('#modpack-progress').textContent='';$('#modpack-create').textContent='Install pack';$('#modpack-create').disabled=!preview.compatible;$('#modpack-modal').hidden=false;$('#modpack-close').focus();}
async function closeModpackReview(){if(!packReview)return;if(packWorking){$('#modpack-progress').textContent='Cancelling…';await api.modpackDiscard(packReview.token);return;}await api.modpackDiscard(packReview.token);packReview=null;$('#modpack-modal').hidden=true;packFocus?.focus();}
$('#modpack-close').addEventListener('click',()=>closeModpackReview().catch(e=>toast(e.message,{error:true})));
$('#modpack-cancel').addEventListener('click',()=>closeModpackReview().catch(e=>toast(e.message,{error:true})));
$('#modpack-local').addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await openModpackReview(await api.modpackLocal(),e.currentTarget);}catch(error){toast(error.message,{error:true});}finally{e.currentTarget.disabled=false;}});
$('#modpack-create').addEventListener('click',async()=>{if(packWorking||!packReview?.compatible)return;packWorking=true;$('#modpack-create').disabled=true;$('#modpack-optional').disabled=true;$('#modpack-progress').textContent='Preparing pack…';try{const result=await api.modpackInstall({token:packReview.token,includeOptional:$('#modpack-optional').checked});state.instances=result.instances;state.activeInstanceId=result.activeInstanceId;fillSettings(result.settings);renderInstances();$('#modpack-modal').hidden=true;showPage('instances');toast('Your modpack is ready. Press Play to launch.');packReview=null;}catch(e){$('#modpack-progress').textContent=e.message;$('#modpack-create').textContent='Review again to retry';}finally{packWorking=false;$('#modpack-optional').disabled=false;}});
api.onModpackProgress(progress=>{$('#modpack-progress').textContent=progress.label+(progress.total?' · '+Math.round(progress.done/progress.total*100)+'%':'');});
document.addEventListener('keydown',e=>{if($('#modpack-modal').hidden)return;if(e.key==='Escape'){e.preventDefault();closeModpackReview().catch(error=>toast(error.message,{error:true}));}if(e.key==='Tab'){const buttons=[...$('#modpack-modal').querySelectorAll('button,input')].filter(x=>!x.disabled&&x.getClientRects().length);if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});

$('#modrinth-packs-browse').addEventListener('click', () => {
  showPage('browse');
  document.querySelector('[data-browse-type="modpack"]').click();
});

// ---------- Game Care ----------
let careWorking = false;
function renderHealth(report) {
  $('#care-status').textContent = `${report.blocked ? 'Launch needs attention' : report.warnings ? 'Ready with warnings' : 'No recognized blockers'} · ${new Date(report.checkedAt).toLocaleTimeString()}`;
  $('#care-checks').replaceChildren(...report.checks.map(check => el('article', { class: `care-check ${check.level}` }, [
    el('span', { class: 'care-state', text: { error: 'FIX', warn: 'REVIEW', good: 'OK', info: 'INFO' }[check.level] }),
    el('div', {}, [el('h3', { text: check.title }), el('p', { text: check.detail })]),
    el('button', { class: 'tool-button', text: 'Open', onclick: () => { if (check.action !== 'care') showPage(check.action); else $('#care-packs').scrollIntoView({ behavior: state.settings?.accessibility?.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); } })
  ])));
}
api.onHealth(report => { renderHealth(report); if (report.blocked) showPage('care'); });
async function scanCare() {
  $('#care-status').textContent = 'Checking your active instance…';
  try { renderHealth(await api.careHealth()); } catch (error) { $('#care-status').textContent = error.message; }
}
function renderCarePacks(report) {
  const selected = report.packs.filter(p => p.selected).sort((a, b) => report.selected.indexOf(`file/${a.name}`) - report.selected.indexOf(`file/${b.name}`));
  const unselected = report.packs.filter(p => !p.selected).sort((a, b) => a.name.localeCompare(b.name));
  const mutate = async (name, action) => {
    if (careWorking) return;
    careWorking = true; $('#care-packs').querySelectorAll('button').forEach(b => b.disabled = true);
    try { renderCarePacks(await api.resourceChange({ name, action })); await scanCare(); }
    catch (e) { toast(e.message, { error: true }); }
    finally { careWorking = false; await loadCarePacks(); }
  };
  const nodes = [el('p', { class: 'field-help', text: report.note })];
  for (const name of report.missing) nodes.push(el('article', { class: 'care-pack warning' }, [el('p', { text: `Selected pack missing: ${name.slice(5)}` }), el('button', { class: 'tool-button', text: 'Remove selection', onclick: () => mutate(name.slice(5), 'disable') })]));
  for (const pack of [...selected, ...unselected]) {
    const actions = [];
    if (pack.selected) {
      actions.push(el('button', { class: 'tool-button', text: '↑ Lower priority', onclick: () => mutate(pack.name, 'up') }), el('button', { class: 'tool-button', text: '↓ Higher priority', onclick: () => mutate(pack.name, 'down') }));
    }
    const button = el('button', { class: 'tool-button', text: pack.selected ? 'Disable' : pack.issues.some(x => x.includes('does not include Minecraft')) ? 'Enable with version warning' : 'Enable', onclick: () => mutate(pack.name, pack.selected ? 'disable' : 'enable') });
    button.disabled = pack.damaged && !pack.selected || state.game.running || state.game.busy;
    actions.push(button);
    nodes.push(el('article', { class: `care-pack${pack.issues.length ? ' warning' : ''}` }, [
      el('div', {}, [el('span', { class: 'instance-badge current', text: pack.selected ? `SELECTED · PRIORITY ${selected.indexOf(pack) + 1}` : 'AVAILABLE' }), el('h3', { text: pack.name }), el('p', { text: pack.description }), ...pack.issues.map(issue => el('p', { class: 'pack-issue', text: issue }))]),
      el('div', { class: 'care-pack-actions' }, actions)
    ]));
  }
  if (!report.packs.length) nodes.push(el('p', { text: 'No resource packs installed. Download Center → Discover Mods → Resource Packs to add one.' }));
  if (report.truncated) nodes.push(el('p', { text: 'Only the first 250 folder entries were inspected.' }));
  $('#care-packs').replaceChildren(...nodes);
}
async function loadCarePacks() { try { renderCarePacks(await api.resourceInspect()); } catch (e) { $('#care-packs').textContent = e.message; } }
function renderBackupStatus(status) { $('#backup-status').textContent = status.message || 'Backups run while Sloth is open and Minecraft is closed.'; }
api.onBackupStatus(renderBackupStatus);
async function loadCare() {
  await scanCare(); await loadCarePacks();
  try {
    const status = await api.backupStatus(); renderBackupStatus(status);
    const p = status.policy; $('#backup-enabled').checked = p.enabled;
    $('#backup-interval').value = String(p.intervalHours); $('#backup-keep').value = p.keep; $('#backup-limit').value = p.maxGb;
  } catch (e) { $('#backup-status').textContent = e.message; }
}
async function repairCare() {
  if (careWorking) return;
  careWorking = true; $('#care-repair').disabled = true; $('#care-status').textContent = 'Saving your setup and repairing managed files…';
  try {
    const result = await api.careRepair(); renderHealth(result.health);
    toast(`Repair complete. Restored ${result.downloaded.files} managed files. Minecraft was not started.`); await loadCarePacks();
  } catch (e) { $('#care-status').textContent = e.message; toast(e.message, { error: true }); }
  finally { careWorking = false; $('#care-repair').disabled = state.game.running || state.game.busy; }
}
$('#care-scan').addEventListener('click', scanCare);
$('#care-repair').addEventListener('click', repairCare);
$('#care-packs-refresh').addEventListener('click', loadCarePacks);
$('#backup-save').addEventListener('click', async () => {
  try {
    fillSettings(await api.saveSettings({ backups: { enabled: $('#backup-enabled').checked, intervalHours: Number($('#backup-interval').value), keep: Number($('#backup-keep').value), maxGb: Number($('#backup-limit').value) } }));
    toast('Backup schedule saved.'); await loadCare();
  } catch (e) { toast(e.message, { error: true }); }
});
$('#backup-now').addEventListener('click', async () => {
  $('#backup-now').disabled = true; $('#backup-status').textContent = 'Saving your worlds…';
  try { renderBackupStatus(await api.backupNow()); } catch (e) { $('#backup-status').textContent = e.message; }
  finally { $('#backup-now').disabled = state.game.running || state.game.busy; }
});
async function loadLauncherRecovery() {
  try {
    const saved = await api.launcherRecovery();
    $('#launcher-recovery-status').textContent = saved.available ? `Version ${saved.version} saved ${new Date(saved.createdAt).toLocaleString()}.` : 'The current launcher will be saved before your next in-app update.';
    $('#launcher-rollback').hidden = !saved.available;recoveryVerify.hidden=!saved.available;
  } catch (e) { $('#launcher-recovery-status').textContent = e.message; }
}
$('#launcher-rollback').addEventListener('click', async () => {
  $('#launcher-rollback').disabled = true;
  $('#launcher-recovery-status').textContent = 'Checking the saved launcher before reopening…';
  try { await api.launcherRollback(); } catch (e) { $('#launcher-recovery-status').textContent = e.message; $('#launcher-rollback').disabled = false; }
});
api.onGameState(game => {
  for (const id of ['care-repair', 'backup-now', 'backup-save', 'launcher-rollback']) $(`#${id}`).disabled = game.running || game.busy || careWorking;
});
api.onProgress(p => { if (careWorking) $('#care-status').textContent = `${p.label || 'Repairing'}${p.total ? ` · ${p.done} / ${p.total}` : '…'}`; });

// ---------- Saved shelf and session tools ----------
function isSaved(id, type) { return state.savedProjects.some(p => p.id === id && p.type === type); }
function syncShelfButtons() { $$('.shelf-save').forEach(b => b.textContent = isSaved(b.dataset.project, b.dataset.type) ? '★ Saved' : '☆ Save'); }
function renderSavedShelf() {
  const query = $('#saved-query').value.trim().toLowerCase(), type = $('#saved-type').value;
  const projects = state.savedProjects.filter(p => (type === 'all' || p.type === type) && `${p.title} ${p.author} ${p.description}`.toLowerCase().includes(query));
  $('#saved-results').replaceChildren(...(projects.length ? projects.map(p => resultRow(p, p.type)) : [el('div', { class: 'browse-empty', text: 'No saved projects match. Use ☆ Save in Discover Mods to add a project.' })]));
}
async function loadSavedShelf() {
  try { state.savedProjects = await api.shelfList(); await refreshInstalled(); renderSavedShelf(); syncShelfButtons(); }
  catch (e) { $('#saved-results').textContent = e.message; }
}
$('#saved-query').addEventListener('input', renderSavedShelf);
$('#saved-type').addEventListener('change', renderSavedShelf);
api.shelfList().then(projects => { state.savedProjects = projects; syncShelfButtons(); }).catch(() => {});
function sessionTime(seconds) { const minutes = Math.floor(Math.max(0, seconds) / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; }
function updateSessionTimer() {
  const elapsed = state.game.running && state.game.startedAt ? Math.floor((Date.now() - Date.parse(state.game.startedAt)) / 1000) : 0;
  const clock = `${Math.floor(elapsed / 3600)}:${String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  $('#session-elapsed').textContent = state.game.running ? state.game.startedAt ? `${clock} · playing` : 'Minecraft is running' : 'Not playing';
  const minutes = state.settings?.reminderMinutes || 0;
  $('#session-reminder-note').textContent = minutes ? `Quiet break reminder every ${minutes} minutes while Sloth stays open.` : 'Break reminders are off. Change them in Settings.';
}
async function loadSessionInsights() {
  try { const summary = await api.sessionInsights(); $('#session-week').textContent = sessionTime(summary.weekSeconds); $('#session-recorded').textContent = `${summary.tracked} / ${summary.launches}`; }
  catch { $('#session-week').textContent = 'Unavailable'; $('#session-recorded').textContent = 'Unavailable'; }
  updateSessionTimer();
}
api.onSessionReminder(reminder => toast(reminder.message));
api.onGameState(() => { updateSessionTimer(); loadSessionInsights(); });
setInterval(updateSessionTimer, 1000);
loadSessionInsights();

// ---------- Worlds, transfers, updates and maintenance ----------
let toolsWorking = false, updatesPlan = null, cleanupPlan = null;
function toolsMessage(message) { $('#tools-status').textContent = message; }
api.onToolsProgress(p => toolsMessage(`${p.label}${p.total ? ` · ${p.done} / ${p.total}` : '…'}`));
async function toolsAction(action) {
  if (toolsWorking) return;
  toolsWorking = true; toolsMessage('Working… Keep the launcher open.');
  $$('#page-toolbox button').forEach(b => b.disabled = true);
  try { const message = await action(); toolsMessage(message || 'Done.'); if (message) toast(message); }
  catch (e) { toolsMessage(e.message); toast(e.message, { error: true }); }
  finally { toolsWorking = false; $$('#page-toolbox button').forEach(b => b.disabled = false); syncReviewActions(); }
}
function loadToolbox() {
  for (const id of ['notes-instance', 'compare-left', 'compare-right']) {
    const select = $(`#${id}`), previous = select.value;
    select.replaceChildren(...state.instances.map(item => el('option', { value: item.id, text: item.name })));
    select.value = state.instances.some(item => item.id === previous) ? previous
      : id === 'compare-right' ? (state.instances.find(item => item.id !== state.activeInstanceId)?.id || state.activeInstanceId)
      : state.activeInstanceId;
  }
  $('#compare-run').disabled = state.instances.length < 2;
  if (state.instances.length < 2) $('#compare-summary').textContent = 'Create a second instance to compare setups.';
  loadInstanceNotes();
  syncReviewActions();
}
function loadInstanceNotes() { const item = state.instances.find(i => i.id === $('#notes-instance').value); $('#instance-tags').value = (item?.tags || []).join(', '); $('#instance-notes').value = item?.notes || ''; }
$('#notes-instance').addEventListener('change', loadInstanceNotes);
$('#notes-save').addEventListener('click', () => toolsAction(async () => { state.instances = await api.editInstance({ id: $('#notes-instance').value, notes: $('#instance-notes').value, tags: $('#instance-tags').value.split(',') }); renderInstances(); loadInstanceNotes(); return 'Instance notes and tags saved.'; }));
function syncReviewActions() {
  $('#mod-updates-apply').disabled = toolsWorking || !$$('.mod-update-choice:checked').length;
  $('#cleanup-run').disabled = toolsWorking || !$$('.cleanup-choice:checked').length;
}
$('#mod-updates-review').addEventListener('click', () => toolsAction(async () => {
  updatesPlan = await api.modUpdatesReview();
  $('#mod-updates-list').replaceChildren(...(updatesPlan.rows.length ? updatesPlan.rows.map(row => {
    const children = [el('h3', { text: row.title }), el('p', { class: 'field-help', text: row.state === 'available' ? `${row.current} → ${row.next}` : row.detail || row.state })];
    if (row.state === 'available') { const checkbox = el('input', { type: 'checkbox', class: 'mod-update-choice', value: row.id, onchange: syncReviewActions }); children.unshift(el('label', {}, [checkbox, document.createTextNode(' Select update')])); children.push(el('details', {}, [el('summary', { text: 'Read release notes' }), el('pre', { class: 'release-notes', text: row.notes })])); }
    return el('article', { class: 'tool-review-row' }, children);
  }) : [el('p', { class: 'field-help', text: 'No tracked Modrinth mods to review. Managed mods update with Sloth; local jars need manual review.' })]));
  return `${updatesPlan.rows.filter(r => r.state === 'available').length} newer releases found${updatesPlan.limited ? ' · limited to 50 tracked mods' : ''}. Select updates after reading their notes.`;
}));
$('#mod-updates-apply').addEventListener('click', () => toolsAction(async () => { const result = await api.modUpdatesApply({ token: updatesPlan?.token, ids: $$('.mod-update-choice:checked').map(c => c.value) }); updatesPlan = null; $('#mod-updates-list').textContent = 'Updates applied. Refresh the review to check again.'; return `Updated ${result.installed.length} projects. Your previous setup is available in Recovery.`; }));
$('#portable-export').addEventListener('click', () => toolsAction(async () => {
  const choices = Object.fromEntries($$('[data-transfer]').map(c => [c.dataset.transfer, c.checked]));
  choices.defaultconfigs = choices.kubejs = choices.scripts = choices.config;
  const result = await api.portableExport(choices); return result ? `Personal archive exported · ${result.files} files · ${mb(result.bytes)}.` : 'Export cancelled.';
}));
$('#portable-import').addEventListener('click', () => toolsAction(async () => { const result = await api.portableImport(); if (!result) return 'Import cancelled.'; state.instances = result.instances; state.activeInstanceId = result.activeInstanceId; fillSettings(result.settings); renderInstances(); loadToolbox(); return 'Archive checked and imported as a new instance. Your existing instances were preserved.'; }));
$('#cleanup-scan').addEventListener('click', () => toolsAction(async () => {
  cleanupPlan = await api.cleanupPreview();
  $('#cleanup-list').replaceChildren(...(cleanupPlan.items.length ? cleanupPlan.items.map(item => el('label', { class: 'cleanup-item' }, [el('input', { type: 'checkbox', class: 'cleanup-choice', value: item.id, onchange: syncReviewActions }), el('span', { text: item.relative }), el('strong', { text: mb(item.bytes) })])) : [el('p', { class: 'field-help', text: 'No old temporary files found in the supported cache/staging folders.' })]));
  return `${cleanupPlan.items.length} temporary files · ${mb(cleanupPlan.bytes)}${cleanupPlan.limited ? ' · preview limited to 1,000 files' : ''}. Nothing has been removed.`;
}));
$('#cleanup-all').addEventListener('click', () => { $$('.cleanup-choice').forEach(c => c.checked = true); syncReviewActions(); });
$('#cleanup-run').addEventListener('click', () => {
  const ids = $$('.cleanup-choice:checked').map(c => c.value); if (!ids.length || !confirm(`Move ${ids.length} selected temporary files to the Recycle Bin?`)) return;
  toolsAction(async () => { const result = await api.cleanupRun({ token: cleanupPlan?.token, ids }); cleanupPlan = null; $('#cleanup-list').textContent = 'Cleanup finished. Refresh the preview for more candidates.'; return `Moved ${result.count} temporary files to the Recycle Bin · ${mb(result.bytes)}.`; });
});
$('#connection-check').addEventListener('click', () => toolsAction(async () => { const report = await api.connectionCheck(); $('#connection-results').replaceChildren(...report.results.map(r => el('article', { class: `care-check ${r.state}` }, [el('span', { class: 'care-state', text: r.state.toUpperCase() }), el('div', {}, [el('h3', { text: r.name }), el('p', { text: `${r.host} · ${r.detail}` }), r.clockWarning && el('p', { text: r.clockWarning })])]))); return `Connection checks completed at ${new Date(report.checkedAt).toLocaleTimeString()}.`; }));
let downloadData = { counts: { completed: 0, failed: 0, bytes: 0 }, jobs: [] };
function renderDownloads() {
  const query = $('#download-query').value.toLowerCase(), filter = $('#download-filter').value;
  const active = downloadData.jobs.filter(j => ['downloading', 'retrying'].includes(j.state)).length;
  $('#download-summary').textContent = `${active} active · ${downloadData.counts.completed} completed · ${downloadData.counts.failed} failed files · ${mb(downloadData.counts.bytes)} received this session`;
  const jobs = downloadData.jobs.filter(j => j.name.toLowerCase().includes(query) && (filter === 'all' || filter === 'active' && ['downloading', 'retrying'].includes(j.state) || filter === 'failed' && j.state === 'failed' || filter === 'completed' && ['completed', 'retried'].includes(j.state)));
  $('#download-list').replaceChildren(...(jobs.length ? jobs.map(job => {
    const progress = el('progress', { max: '100', value: String(job.percent || 0), 'aria-label': `${job.name} download progress` }); if (job.percent === null && ['downloading', 'retrying'].includes(job.state)) progress.removeAttribute('value');
    const children = [el('h3', { text: job.name }), el('p', { class: 'field-help', text:job.id==='launcher-update'?job.state.toUpperCase()+' · '+(job.updatePercent||0)+'% · integrity checked before installation':`${job.state.toUpperCase()} · ${mb(job.received)}${job.size ? ` / ${mb(job.size)}` : ''}${job.attempt ? ` · attempt ${job.attempt + 1}` : ''}` }), progress];
    if(['failed','cancelled'].includes(job.state))children.push(el('p',{class:'field-help',text:job.canRetry?'This file was interrupted. Retry verifies the file again; afterward return to the original install or launch action.':'Restart the original action to request this file again.'}));
    if(job.canCancel)children.push(el('button',{class:'tool-button',text:'Cancel download',onclick:async()=>{try{await api.downloadCancel(job.id);toast('Download cancellation requested. Restart the original action to finish installation.');}catch(e){toast(e.message,{error:true});}}}));
    if(job.id==='launcher-update')children.push(el('button',{class:'tool-button',text:'Update Client',onclick:()=>showPage('updates')}));
    if (job.canRetry) children.push(el('button', { class: 'tool-button', text: 'Retry this file', onclick: async () => { try { await api.downloadRetry(job.id); toast('File restored. Return to the original action to complete the operation.'); } catch (e) { toast(e.message, { error: true }); } } }));
    return el('article', { class: 'tool-review-row' }, children);
  }) : [el('p', { class: 'field-help', text: 'No matching download activity in this launcher session.' })]));
}
async function loadDownloads() { try { downloadData = await api.downloadsList(); renderDownloads(); } catch (e) { $('#download-list').textContent = e.message; } }
api.onDownloads(data => { downloadData = data; if ($('#page-downloads').classList.contains('active')) renderDownloads(); });
$('#download-refresh').addEventListener('click', loadDownloads); $('#download-query').addEventListener('input', renderDownloads); $('#download-filter').addEventListener('change', renderDownloads);
function applyAccessibility(value = {}) {
  document.body.style.setProperty('--text-scale', value.textScale || 1);
  document.body.classList.toggle('larger-text', (value.textScale || 1) > 1);
  document.body.classList.toggle('reduce-motion', Boolean(value.reduceMotion) || matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.body.classList.toggle('high-contrast', Boolean(value.highContrast));
}
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || [...$$('.modal-backdrop')].some(m => !m.hidden)) return;
  const page = { '1': 'home', '2': 'instances', '3': 'mods', '4': 'downloads', ',': 'settings' }[event.key];
  if (page) { event.preventDefault(); showPage(page); }
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => applyAccessibility(state.settings?.accessibility));
quickActions.push(...[['downloads', 'Download Center: progress and failed-file retries'], ['toolbox', 'Toolbox: updates, transfer, cleanup, notes and diagnostics'], ['saved', 'Download Center: Saved Projects']].map(([page, label]) => ({ label, run: () => showPage(page) })));

// Local comparison and actionable crash clues.
let comparisonReport = null;
function renderComparison() {
  if (!comparisonReport) return;
  const query = $('#compare-query').value.toLowerCase();
  const rows = comparisonReport.rows.filter(r => `${r.path} ${r.status}`.toLowerCase().includes(query));
  const settings = comparisonReport.settings.filter(r => r.key.toLowerCase().includes(query));
  const format = value => value === null ? 'Not set' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  $('#compare-summary').textContent = `${comparisonReport.left} → ${comparisonReport.right} · ${comparisonReport.scanned} files scanned · ${comparisonReport.rows.length} file differences · ${comparisonReport.settings.length} setting differences. Showing ${Math.min(rows.length, 300)} file differences${rows.length > 300 ? '; filter to narrow results' : ''}.`;
  $('#compare-results').replaceChildren(
    ...settings.map(r => el('article', { class: 'care-pack' }, [el('h3', { text: r.key }), el('p', { text: `${format(r.left)} → ${format(r.right)}` })])),
    ...rows.slice(0, 300).map(r => el('article', { class: 'care-pack' }, [el('h3', { text: r.path }), el('p', { text: `${r.status} · Left: ${r.leftSize === null ? 'absent' : mb(r.leftSize)} · Right: ${r.rightSize === null ? 'absent' : mb(r.rightSize)}` })]))
  );
}
$('#compare-query').addEventListener('input', renderComparison);
$('#compare-run').addEventListener('click', () => toolsAction(async () => {
  $('#compare-summary').textContent = 'Reading file fingerprints…';
  try { comparisonReport = await api.compareInstances({ left: $('#compare-left').value, right: $('#compare-right').value }); renderComparison(); return 'Comparison complete. No files were changed.'; }
  catch (e) { comparisonReport = null; $('#compare-results').replaceChildren(); $('#compare-summary').textContent = e.message; throw e; }
}));
$('#crash-review').addEventListener('click', async () => {
  const button = $('#crash-review'); button.disabled = true; $('#crash-status').textContent = 'Reviewing captured output…';
  try {
    const result = await api.diagnose();
    $('#crash-status').textContent = result.hasOutput ? `${result.source || 'Captured output'} · ${result.findings.length} recognized clues. Several clues may describe the same failure.${result.truncated ? ' Only the last 1 MB was read.' : ''}` : 'No captured output is available. Launch Minecraft first or open the game log.';
    $('#crash-results').replaceChildren(...result.findings.map(f => el('article', { class: 'care-pack' }, [
      el('span', { class: 'instance-badge', text: f.confidence || 'Possible cause' }), el('h3', { text: f.title }), el('p', { text: f.advice }),
      el('p', { class: 'field-help', text: f.evidence ? `Matched clue: ${f.evidence}` : '' }),
      el('button', { class: 'tool-button', text: `Open ${({ care: 'Game Care', settings: 'Settings', mods: 'Mod Manager', instances: 'Instances', toolbox: 'Toolbox', home: 'Home' })[f.action] || 'Game Log'}`, onclick: () => showPage(f.action || 'log') })
    ])));
    if (result.hasOutput && !result.findings.length) $('#crash-results').append(el('p', { text: 'No known pattern matched. Inspect Game Log or export a support report; the assistant cannot determine the cause from this output.' }));
  } catch (e) { $('#crash-status').textContent = e.message; $('#crash-results').replaceChildren(); }
  finally { button.disabled = false; }
});


api.onGameState(renderAppearance);

// Session planning extends Setup Studio rather than introducing another sidebar destination.
let plannerGeneration=0;
async function loadSessionPlanner(){const generation=++plannerGeneration;try{const data=await api.sessionStatus();if(generation!==plannerGeneration)return;const value=$('#session-profile').value;$('#session-profile').replaceChildren(el('option',{value:'',text:'Use play style'}),...data.profiles.map(p=>el('option',{value:p.id,text:p.name})));$('#session-profile').value=data.profiles.some(p=>p.id===value)?value:'';for(const [index,id]of ['session-compare-left','session-compare-right'].entries()){const select=$('#'+id),previous=select.value;select.replaceChildren(...data.profiles.map(p=>el('option',{value:p.id,text:p.name})));select.value=data.profiles.some(p=>p.id===previous)?previous:(data.profiles[index]?.id||data.profiles[0]?.id||'');}$('#session-compare').disabled=data.profiles.length<2;$('#session-undo').disabled=!data.undoAvailable;$('#session-status').textContent=state.instances.find(i=>i.id===state.activeInstanceId)?.name+' · '+data.profiles.length+' saved setups';}catch(e){$('#session-status').textContent=e.message;}}
async function sessionAction(button,action){button.disabled=true;try{await action();}catch(e){toast(e.message,{error:true});}finally{button.disabled=false;}}
$('#session-refresh').addEventListener('click',loadSessionPlanner);
$('#session-save').addEventListener('click',e=>sessionAction(e.currentTarget,async()=>{await api.sessionSave($('#session-name').value);$('#session-name').value='';await loadSessionPlanner();toast('Current setup saved locally.');}));
$('#session-remove').addEventListener('click',e=>sessionAction(e.currentTarget,async()=>{const id=$('#session-profile').value;if(!id){toast('Select a saved setup first.');return;}if(!confirm('Delete this saved session? Your current setup is preserved.'))return;await api.sessionRemove(id);await loadSessionPlanner();}));
$('#session-review').addEventListener('click',e=>sessionAction(e.currentTarget,async()=>{const plan=await api.sessionPreview({style:$('#session-style').value,profile:$('#session-profile').value,accessibility:$('#session-accessibility').value});if(!plan.changes.length){toast('This setup already matches your session.');return;}const ids=await reviewChanges('Session: '+plan.label,plan.changes);if(!ids)return;const result=await api.sessionApply({token:plan.token,ids});fillSettings(result.settings);await loadSessionPlanner();toast('Reviewed changes applied for next launch. Undo is available.');}));
$('#session-undo').addEventListener('click',e=>sessionAction(e.currentTarget,async()=>{fillSettings(await api.sessionUndo());await loadSessionPlanner();toast('Session plan undone.');}));
async function loadStartupTimeline(){try{const rows=await api.startupTimeline();$('#startup-timeline').replaceChildren(...(rows.length?rows.map(row=>el('article',{class:'timeline-entry'},[el('h3',{text:new Date(row.startedAt).toLocaleString()+' · '+row.status}),...row.phases.map(p=>el('div',{class:'timeline-phase'},[el('span',{text:p.name}),el('progress',{max:Math.max(1,...row.phases.map(x=>x.ms||0)),value:p.ms||0,'aria-label':p.name}),el('b',{text:p.ms===null?'Untracked':(p.ms/1000).toFixed(2)+' s'})]))])):[el('p',{class:'field-help',text:'Your next launch will record a startup timeline.'})]));}catch(e){$('#startup-timeline').textContent=e.message;}}
$('#timeline-refresh').addEventListener('click',loadStartupTimeline);
async function previewSupportReport(){
 const data=await api.supportPreview(),previous=document.activeElement;
 const dialog=el('dialog',{class:'support-preview', 'aria-label':'Review support report'}),chosen=new Set(['system','minecraft','health','launchFindings']);
 const labels={system:'Computer details',minecraft:'Game versions',setup:'Setup and storage',mods:'Mod filenames and metadata',health:'Health checks',launchFindings:'Launch findings',logExcerpt:'Cleaned game log excerpt (optional)'};
 const output=el('pre',{class:'support-json',tabindex:'0'}),controls=el('div',{class:'update-page-actions'}),status=el('p',{role:'status',class:'field-help'});
 const render=()=>{const report={schema:1,generatedAt:data.report.generatedAt,launcherVersion:data.report.launcherVersion,privacy:data.report.privacy};for(const k of chosen)report[k]=data.report[k];output.textContent=JSON.stringify(report,null,2);status.textContent=chosen.size+' sections selected · '+new TextEncoder().encode(output.textContent).length.toLocaleString()+' bytes · saved only to the file you choose';};
 dialog.append(el('h2',{text:'REVIEW SUPPORT REPORT'}),el('p',{class:'field-help',text:'This is the exact selected content that will be saved. Nothing is uploaded. Storage and mod metadata are optional and start excluded. Inspect diagnostic messages for personal details before sharing.'}),el('div',{class:'support-sections'},Object.entries(labels).map(([key,label])=>el('label',{},[el('input',{type:'checkbox',...(chosen.has(key)?{checked:true}:{}),onchange:e=>{e.target.checked?chosen.add(key):chosen.delete(key);render();}}),el('span',{text:label})]))),output,status,controls);
 const close=()=>{dialog.close();dialog.remove();previous?.focus();};dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 const save=el('button',{class:'save-button',text:'SAVE SELECTED REPORT',onclick:async()=>{save.disabled=true;try{if(!chosen.size)throw Error('Choose a section to include.');if(await api.supportExport({token:data.token,sections:[...chosen]})){toast('Reviewed support report saved.');close();}}catch(e){status.textContent=e.message;}finally{save.disabled=false;}}});controls.append(el('button',{class:'tool-button',text:'Cancel',onclick:close}),save);render();document.body.append(dialog);dialog.showModal();controls.firstChild.focus();
}

const recoveryVerify=el('button',{class:'tool-button',text:'Verify previous launcher',hidden:true,onclick:async()=>{recoveryVerify.disabled=true;try{const s=await api.launcherRecoveryVerify();$('#launcher-recovery-status').textContent='Preserved launcher '+s.version+' passed its file checks. Recovery opens that copy with updates paused; accounts and worlds stay in your existing profile.';}catch(e){$('#launcher-recovery-status').textContent=e.message;}finally{recoveryVerify.disabled=false;}}});$('#launcher-rollback').before(recoveryVerify);

$('#session-compare').addEventListener('click',e=>sessionAction(e.currentTarget,async()=>{
 const result=await api.sessionCompare({left:$('#session-compare-left').value,right:$('#session-compare-right').value});
 const opener=e.currentTarget,close=el('button',{class:'tool-button',text:'Close comparison'});
 const dialog=el('dialog',{class:'support-preview'},[el('h2',{text:result.left+' compared with '+result.right}),el('p',{class:'field-help',text:result.note}),el('p',{text:result.total+(result.total===1?' difference':' differences')+(result.limited?' · showing first 500':'')}),el('div',{class:'support-json'},result.changes.map(c=>el('p',{},[el('b',{text:c.field}),el('br'),el('span',{text:result.left+': '+c.left+' → '+result.right+': '+c.right})]))),close]);
 const cleanup=()=>{dialog.remove();opener.focus();};close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',cleanup,{once:true});document.body.append(dialog);dialog.showModal();close.focus();
}));
// Additive tools reuse the existing modal and button styles.
function safetyDialog(title, help) {
 const previous=document.activeElement,dialog=el('dialog',{class:'support-preview','aria-label':title}),content=el('div',{}),status=el('p',{class:'field-help',role:'status'}),controls=el('div',{class:'update-page-actions'});
 const close=()=>{dialog.close();dialog.remove();previous?.focus();};
 controls.append(el('button',{class:'tool-button',text:'Close',onclick:close}));dialog.append(el('h2',{text:title}),el('p',{class:'field-help',text:help}),content,status,controls);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(dialog);dialog.showModal();controls.firstChild.focus();return {dialog,content,status,close};
}
function acceptSafetyState(result){state.instances=result.instances;state.activeInstanceId=result.activeInstanceId;fillSettings(result.settings);if(result.game)state.game=result.game;renderInstances();renderPlay();}
async function settingsBackupDialog(){
 const view=safetyDialog('Settings backups','Launcher preferences are saved before changes. Restoring keeps your current settings in history. In-game HUD and keybind history is available under Client menu → Saved setups → Undo recent changes.');
 try{const rows=await api.settingsHistory();view.content.replaceChildren(...rows.map(row=>el('article',{class:'care-pack'},[el('h3',{text:new Date(row.createdAt).toLocaleString()}),el('p',{class:'field-help',text:'Instance: '+(state.instances.find(v=>v.id===row.instanceId)?.name||row.instanceId||'Launcher')}),el('button',{class:'tool-button',text:'Review backup',onclick:async()=>{try{const setup=await api.settingsHistoryPreview(row.id);const review=safetyDialog('Restore settings backup','These are the saved preferences. Your current setup will be backed up before restoring. Worlds and account records are untouched.');review.content.append(el('pre',{class:'support-json',text:JSON.stringify(setup,null,2)}));review.content.append(el('button',{class:'save-button',text:'Restore reviewed settings',onclick:async e=>{e.target.disabled=true;try{acceptSafetyState(await api.settingsHistoryRestore(row.id));review.close();view.close();toast('Settings restored. The previous setup is in history.');}catch(err){review.status.textContent=err.message;}finally{e.target.disabled=false;}}}));}catch(err){view.status.textContent=err.message;}}})])));if(!rows.length)view.status.textContent='Your first settings change will create a backup.';}catch(e){view.status.textContent=e.message;}
}
async function serverSetupDialog(){
 const view=safetyDialog('Server setups','Choose the instance containing your mods, game settings and local appearance. Sloth applies it before launch and joins the saved server. An optional saved in-game profile applies HUD and video settings on joining; your previous HUD setup returns when you leave. Mods require a restart.');
 const host=el('input',{class:'instance-name-input',maxlength:255,placeholder:'play.example.net:25565','aria-label':'Server address'}),instance=el('select',{'aria-label':'Game instance'},state.instances.map(v=>el('option',{value:v.id,text:v.name}))),profile=el('input',{class:'instance-name-input',maxlength:24,placeholder:'Optional saved client profile','aria-label':'Saved client profile name'}),rows=el('div',{});
 instance.value=state.activeInstanceId;
 const render=async()=>{const list=await api.serverProfiles();rows.replaceChildren(...list.map(row=>el('article',{class:'care-pack'},[el('h3',{text:row.address}),el('p',{class:'field-help',text:(state.instances.find(v=>v.id===row.instanceId)?.name||'Missing instance')+(row.profile?' · '+row.profile:'')}),el('div',{class:'update-page-actions'},[el('button',{class:'tool-button',text:'Edit',onclick:()=>{host.value=row.address;instance.value=row.instanceId;profile.value=row.profile;host.focus();}}),el('button',{class:'tool-button',text:'Launch',onclick:async e=>{e.target.disabled=true;try{acceptSafetyState(await api.serverPlay(row.address));view.close();toast('Starting your server setup…');}catch(err){view.status.textContent=err.message;acceptSafetyState(await api.bootstrap());}finally{e.target.disabled=false;}}}),el('button',{class:'tool-button',text:'Remove association',onclick:async()=>{try{await api.serverProfileRemove(row.address);await render();}catch(e){view.status.textContent=e.message;}}})])])));};
 view.content.append(el('label',{class:'field-label',text:'Server address'}),host,el('label',{class:'field-label',text:'Instance'}),instance,el('label',{class:'field-label',text:'In-game profile (optional)'}),profile,el('p',{class:'field-help',text:'Save the named profile in the chosen instance first. Leaving the server restores your earlier HUD and video setup.'}),el('button',{class:'save-button',text:'Save server setup',onclick:async()=>{try{await api.serverProfileSave({address:host.value.trim(),instanceId:instance.value,profile:profile.value.trim()});await render();view.status.textContent='Server setup saved. Existing instance files were preserved.';}catch(e){view.status.textContent=e.message;}}}),rows);
 try{await render();}catch(e){view.status.textContent=e.message;}
}
$('#recovery-save').after(el('button',{class:'tool-button',id:'settings-backups',text:'Settings backups',onclick:()=>settingsBackupDialog().catch(e=>toast(e.message,{error:true}))}));
$('#instance-create').parentElement.firstElementChild.append(el('button',{class:'tool-button',id:'server-setups',text:'Server setups',onclick:()=>serverSetupDialog().catch(e=>toast(e.message,{error:true}))}));
