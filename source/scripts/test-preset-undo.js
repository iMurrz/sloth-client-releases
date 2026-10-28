const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const performance=require('../src/lib/performance');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sloth-preset-undo-')),file=path.join(dir,'options.txt');
 const original='renderDistance:12\r\nmaxFps:144\r\nmusic:0.5\r\n';await fs.writeFile(file,original);
 await performance.apply(dir,'performance',['renderDistance']);
 await fs.appendFile(file,'customServerSetting:true\r\n');
 await performance.restore(dir);assert.equal(await fs.readFile(file,'utf8'),original+'customServerSetting:true\r\n');
 await performance.apply(dir,'performance',['renderDistance']);await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('renderDistance:8','renderDistance:20'));
 const newer=await fs.readFile(file,'utf8');await assert.rejects(performance.restore(dir),/changed since the preset/);assert.equal(await fs.readFile(file,'utf8'),newer);
 await performance.apply(dir,'visual',[]);const unchanged=await fs.readFile(file,'utf8');await performance.restore(dir);assert.equal(await fs.readFile(file,'utf8'),unchanged);
 await fs.writeFile(file,'music:0.3\n');await performance.apply(dir,'quiet',['maxFps']);await performance.restore(dir);assert.equal(await fs.readFile(file,'utf8'),'music:0.3\n');
 await fs.writeFile(file+'.sloth-preset-backup','legacy whole options');await assert.rejects(performance.restore(dir),/older preset/);
 console.log('PASS selective Undo, unrelated edits, conflict preservation, empty selection, absent options, safe refusal of legacy backups.');
})().catch(e=>{console.error(e);process.exitCode=1;});
