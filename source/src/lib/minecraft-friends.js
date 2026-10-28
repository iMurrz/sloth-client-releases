// Read-only protocol checked against Mojang authlib 7.0.72. No social mutations.
const NAME = /^[A-Za-z0-9_]{3,16}$/;
const UUID = /^[a-f0-9-]{32,36}$/i;
async function get(route, token) {
  const response = await fetch('https://api.minecraftservices.com/' + route, { method:'GET', redirect:'error', signal:AbortSignal.timeout(10000), headers:{ Authorization:`Bearer ${token}`, Accept:'application/json', 'Cache-Control':'no-cache' } });
  if (!response.ok) { await response.body?.cancel(); throw new Error(response.status === 401 ? 'Minecraft session expired. Sign in again.' : response.status === 403 ? 'Minecraft has not allowed friends access for this account or application. Privacy and application permissions must be respected.' : response.status === 429 ? 'Minecraft friends is rate limited. Wait before refreshing.' : `Minecraft friends unavailable (HTTP ${response.status}).`); }
  const reader=response.body.getReader(), chunks=[]; let size=0;
  try { while(true) { const result=await reader.read(); if(result.done)break; size+=result.value.length; if(size>262144)throw new Error('Minecraft friends response is oversized.'); chunks.push(Buffer.from(result.value)); } }
  finally { await reader.cancel().catch(()=>{}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
class MinecraftFriends {
  constructor() { this.pending=new Map(); this.next=new Map(); }
  load(uuid, sessionProvider) {
    if(this.pending.has(uuid))return this.pending.get(uuid);
    if(Date.now()<(this.next.get(uuid)||0))throw new Error('Wait one minute before refreshing Minecraft friends again.');
    this.next.set(uuid,Date.now()+60000);
    const job=(async()=>{
      const {accessToken}=await sessionProvider();
      const data=await get('friends',accessToken);
      const list=value=>{ if(!Array.isArray(value)||value.length>1000||value.some(x=>!NAME.test(x?.name||'')||!UUID.test(x?.profileId||'')))throw new Error('Minecraft friends returned an unsupported format.');return value.map(x=>({name:x.name,uuid:x.profileId})); };
      const friends=list(data.friends), incoming=list(data.incomingRequests), outgoing=list(data.outgoingRequests);
      let presence=[], warning='';
      try { const result=await get('presence',accessToken); if(!Array.isArray(result.presence)||result.presence.length>1000)throw new Error('Unsupported presence format'); presence=result.presence; }
      catch { warning='Friend list loaded; official activity is unavailable. Activity remains unknown.'; }
      const labels={ONLINE:'Online',OFFLINE:'Offline (as reported by Minecraft)',PLAYING_OFFLINE:'In a world',PLAYING_REALMS:'Playing Realms',PLAYING_SERVER:'Playing on a server',PLAYING_HOSTED_SERVER:'In a hosted world'};
      const states=new Map(presence.filter(x=>UUID.test(x?.profileId||'')).map(x=>[x.profileId.replace(/-/g,'').toLowerCase(),labels[typeof x.status==='string'?x.status.toUpperCase():'']||'Activity unknown']));
      return {uuid,friends:friends.map(x=>({...x,status:states.get(x.uuid.replace(/-/g,'').toLowerCase())||'Activity unknown'})),incoming,outgoing,warning,at:Date.now()};
    })().finally(()=>this.pending.delete(uuid));
    this.pending.set(uuid,job);return job;
  }
}
module.exports={MinecraftFriends};
