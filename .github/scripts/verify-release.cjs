const fs=require('node:fs'),crypto=require('node:crypto');
const repo='iMurrz/sloth-client-releases';
const key='-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAlH2YtybTyEgA/VJ+C35N/Rdtn239mPWwGuKXn+JscUk=\n-----END PUBLIC KEY-----\n';
const hash=(algorithm,bytes)=>crypto.createHash(algorithm).update(bytes).digest('hex');
const signature=(bytes,version,name,sig)=>{
 sig=sig.trim();
 if(!/^[A-Za-z0-9+/]{86}==$/.test(sig))throw Error('Invalid signature format: '+name);
 const message=Buffer.from(`sloth-launcher-update:v1\n${version}\n${name}\n${hash('sha512',bytes)}`);
 if(!crypto.verify(null,message,key,Buffer.from(sig,'base64')))throw Error('Signature verification failed: '+name);
};
async function request(url){
 const result=await fetch(url,{signal:AbortSignal.timeout(180000),headers:{'User-Agent':'Sloth-release-integrity','Accept':'application/vnd.github+json'}});
 if(!result.ok)throw Error(`Download failed: HTTP ${result.status}`);
 return result;
}
(async()=>{
 const tag=process.env.RELEASE_TAG||'latest';
 if(tag!=='latest'&&!/^v\d+\.\d+\.\d+$/.test(tag))throw Error('Invalid release tag');
 const release=await (await request(`https://api.github.com/repos/${repo}/releases/${tag==='latest'?'latest':'tags/'+tag}`)).json();
 if(release.draft||release.prerelease||!/^v\d+\.\d+\.\d+$/.test(release.tag_name))throw Error('Expected a published stable release');
 const version=release.tag_name.slice(1),installer=`Sloth-Client-Setup-${version}.exe`,inventory=`Sloth-Client-${version}-files.json`,feed='Sloth-Client-update.json';
 const names=[installer,inventory,feed].flatMap(name=>[name,name+'.sig']);
 const downloads=new Map(),checks=[];
 for(const name of names){
  const matching=release.assets.filter(asset=>asset.name===name);
  if(matching.length!==1)throw Error('Missing or duplicate asset: '+name);
  const asset=matching[0];
  const url=new URL(asset.browser_download_url);
  if(url.protocol!=='https:'||url.hostname!=='github.com'||!url.pathname.startsWith('/'+repo+'/releases/download/'+release.tag_name+'/'))throw Error('Unexpected asset URL');
  if(asset.size<1||asset.size>350000000)throw Error('Unexpected asset size');
  const bytes=Buffer.from(await (await request(url.href)).arrayBuffer());
  const sha256=hash('sha256',bytes);
  if(bytes.length!==asset.size||asset.state!=='uploaded'||asset.digest!=='sha256:'+sha256)throw Error('GitHub asset digest or length mismatch: '+name);
  downloads.set(name,bytes);checks.push({name,bytes:bytes.length,sha256});
 }
 for(const name of [installer,inventory,feed])signature(downloads.get(name),version,name,downloads.get(name+'.sig').toString('utf8'));
 const metadata=JSON.parse(downloads.get(feed));
 const payload=downloads.get(installer);
 if(metadata.schema!==1||metadata.kind!=='development'||metadata.version!==version||metadata.fileName!==installer||metadata.bytes!==payload.length||metadata.sha512!==hash('sha512',payload))throw Error('Signed feed does not match installer');
 signature(payload,version,installer,metadata.installerSignature);
 const manifest=JSON.parse(downloads.get(inventory));
 if(manifest.schema!==1||manifest.version!==version||!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>10000)throw Error('Invalid signed inventory');
 const paths=new Set();
 for(const file of manifest.files){
  if(typeof file.path!=='string'||!file.path||file.path.startsWith('/')||file.path.includes('\\')||file.path.includes(':')||file.path.split('/').some(part=>!part||part==='.'||part==='..')||paths.has(file.path.toLowerCase())||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid inventory record');
  paths.add(file.path.toLowerCase());
 }
 const report={verified:true,version,release:release.html_url,checkedAt:new Date().toISOString(),checks,ed25519Signatures:'installer, feed and inventory passed',inventoryEntries:manifest.files.length,scope:'Downloaded release authenticity and integrity. This workflow does not install or execute the application, unpack and compare installed files, scan for malware, prove build provenance, or provide Windows publisher signing.'};
 fs.writeFileSync('release-integrity.json',JSON.stringify(report,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Release integrity verified: ${version}\n\n[Release](${release.html_url})\n\nAll six asset sizes and SHA-256 digests match GitHub metadata. Ed25519 signatures for installer, feed and inventory are valid; the signed feed matches the downloaded installer.\n\n| Asset | SHA-256 |\n|---|---|\n${checks.map(c=>`| ${c.name} | \`${c.sha256}\` |`).join('\n')}\n\n**Scope:** ${report.scope}\n`);
 console.log('Release integrity verified: '+version);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
