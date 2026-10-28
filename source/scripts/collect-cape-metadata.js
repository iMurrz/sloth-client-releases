// Development metadata collector. No cape artwork is bundled or vendored.
const fs = require('node:fs/promises');
async function main() {
  const index = await (await fetch('https://mcprofiles.me/capes/official')).text();
  const links = [...new Set([...index.matchAll(/href="(\/capes\/official\/[a-z0-9-]+)"/g)].map(m => m[1]))].filter(p => !p.endsWith('/test'));
  const entries = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < links.length) {
      const source = 'https://mcprofiles.me' + links[cursor++];
      const html = await (await fetch(source, { signal: AbortSignal.timeout(20000) })).text();
      const texture = html.match(/src="https:\/\/textures\.minecraft\.net\/texture\/([0-9a-f]{32,64})"[^>]*alt="([^\"]*) texture sheet"/);
      if (!texture) throw new Error('No documented texture: ' + source);
      const hash = texture[1];
      const response = await fetch('https://textures.minecraft.net/texture/' + hash, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Unavailable Mojang texture: ' + source);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 131072 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 64 || bytes.readUInt32BE(20) !== 32) throw new Error('Unsupported texture: ' + source);
      entries.push({ id: source.split('/').pop(), name: texture[2].replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&'), texture: hash, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex'), source });
    }
  }));
  entries.sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile('src/lib/local-cape-catalog.json', JSON.stringify({ schema: 1, collected: '2026-10-01', entries }, null, 2) + '\n');
  console.log('Recorded ' + entries.length + ' cape names and verified Mojang texture digests; no images saved.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
