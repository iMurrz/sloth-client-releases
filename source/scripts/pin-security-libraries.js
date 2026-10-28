// Release maintenance: update explicitly selected logging components from Apache's Maven repository.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const VERSION = '2.25.5';
(async () => {
  const libraries = [];
  for (const artifact of ['log4j-api', 'log4j-core', 'log4j-slf4j2-impl']) {
    const relative = `org/apache/logging/log4j/${artifact}/${VERSION}/${artifact}-${VERSION}.jar`;
    const url = 'https://repo.maven.apache.org/maven2/' + relative;
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error('Unable to retrieve Apache artifact');
    const bytes = Buffer.from(await res.arrayBuffer());
    const checksum = await fetch(url + '.sha1', { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!checksum.ok) throw new Error('Unable to retrieve Apache checksum');
    const sha512 = crypto.createHash('sha512').update(bytes).digest('hex');
    if ((await checksum.text()).trim().toLowerCase() !== crypto.createHash('sha1').update(bytes).digest('hex')) throw new Error('Apache artifact checksum mismatch');
    libraries.push({ name: `org.apache.logging.log4j:${artifact}:${VERSION}`, downloads: { artifact: { path: relative, url, sha512, size: bytes.length } } });
    console.log('Pinned ' + artifact + ' ' + VERSION);
  }
  await fs.writeFile(path.join(__dirname, '../src/lib/game/security-libraries.json'), JSON.stringify({ schema: 1, reason: 'Apache Logging Services published security advisories; conservative 2.25.x patch update', source: 'https://logging.apache.org/security.html', libraries }, null, 2) + '\n');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
