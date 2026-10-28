const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { download } = require('../src/lib/http');
const lock = require('../src/lib/game/game-lock.json');
const pins = require('../src/lib/game/security-libraries.json');
let root;
(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sloth-logging-security-'));
  const classpath = [];
  for (const lib of pins.libraries) {
    assert.match(lib.name, /:2\.25\.5$/);
    const artifact = lib.downloads.artifact, file = path.join(root, path.basename(artifact.path));
    await download(artifact.url, file, { sha512: artifact.sha512, size: artifact.size, retries: 0 }); classpath.push(file);
  }
  const text = await (await fetch(lock.versionJson.url)).text();
  assert.equal(crypto.createHash('sha1').update(text).digest('hex'), lock.versionJson.sha1);
  const slf4j = JSON.parse(text).libraries.find(lib => lib.name.startsWith('org.slf4j:slf4j-api:'))?.downloads.artifact;
  assert.ok(slf4j); const file = path.join(root, 'slf4j-api.jar');
  await download(slf4j.url, file, { sha1: slf4j.sha1, size: slf4j.size, retries: 0 }); classpath.push(file);
  const source = path.join(root, 'LoggingSmoke.java');
  await fs.writeFile(source, `import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.net.JndiManager;
import org.apache.logging.log4j.core.layout.PatternLayout;
public class LoggingSmoke {
 public static void main(String[] args) {
  String version = LogManager.class.getPackage().getImplementationVersion();
  if (!"2.25.5".equals(version)) throw new AssertionError("Wrong logging version " + version);
  if (JndiManager.isJndiEnabled()) throw new AssertionError("JNDI unexpectedly enabled");
  org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger("SlothSecurityFixture");
  if (!logger.getClass().getName().startsWith("org.apache.logging.slf4j.")) throw new AssertionError("Binding missing");
  var event = org.apache.logging.log4j.core.impl.Log4jLogEvent.newBuilder().setMessage(new org.apache.logging.log4j.message.SimpleMessage("Synthetic harmless text")).build();
  if (!PatternLayout.newBuilder().withPattern("%m").build().toSerializable(event).equals("Synthetic harmless text")) throw new AssertionError("Pattern compatibility");
  logger.error("Synthetic Sloth logging smoke test");
  System.out.println("PASS Log4j 2.25.5 API/Core/SLF4J binding and pattern compatibility; JNDI disabled");
 }
}`);
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  console.log(execFileSync(java, ['--class-path', classpath.join(path.delimiter), source], { encoding: 'utf8', timeout: 30000, windowsHide: true }).trim());
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });
