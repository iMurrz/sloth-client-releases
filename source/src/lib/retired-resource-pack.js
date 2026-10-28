const fs = require('node:fs');
const path = require('node:path');
const retired = name => /^murr?ful(?:[ _-].*)?\.zip$/i.test(name);
function safe(root, target) {
  if (!target.startsWith(root + path.sep)) throw Error('Invalid pack cleanup path.');
  for (let p = target; p !== root; p = path.dirname(p)) if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw Error('Linked pack files are not supported.');
}
function removeRetiredResourcePack(instance) {
  const root = path.resolve(instance), options = path.join(root,'options.txt');
  safe(root,options);
  if (fs.existsSync(options)) {
    if (fs.statSync(options).size > 1024 * 1024) throw Error('Options file exceeds its size limit.');
    const original = fs.readFileSync(options,'utf8');
    const updated = original.replace(/^(resourcePacks|incompatibleResourcePacks):(\[[^\r\n]*\])(?=\r?$)/gm, (line,key,json) => {
      const ids = JSON.parse(json);
      if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) throw Error('Invalid resource-pack selection.');
      return `${key}:${JSON.stringify(ids.filter(id => !id.startsWith('file/') || !retired(id.slice(5))))}`;
    });
    if (updated !== original) {
      fs.copyFileSync(options,`${options}.before-pack-removal-${Date.now()}`,fs.constants.COPYFILE_EXCL);
      const temporary = `${options}.pack-removal-${process.pid}-${Date.now()}`;
      fs.writeFileSync(temporary,updated,{flag:'wx'}); fs.renameSync(temporary,options);
    }
  }
  const packs = path.join(root,'resourcepacks'); safe(root,packs);
  if (fs.existsSync(packs)) for (const name of fs.readdirSync(packs)) {
    if (!retired(name)) continue;
    const file = path.join(packs,name); safe(root,file);
    if (fs.lstatSync(file).isFile()) fs.unlinkSync(file);
  }
  const marker = path.join(root,'.sloth-default-resourcepacks.json'); safe(root,marker);
  if (fs.existsSync(marker)) {
    if (fs.statSync(marker).size > 1024 * 1024) throw Error('Pack marker exceeds its size limit.');
    const value = JSON.parse(fs.readFileSync(marker,'utf8'));
    if (Array.isArray(value.applied)) {
      value.applied = value.applied.filter(name => typeof name === 'string' && !retired(name));
      if (value.applied.length) fs.writeFileSync(marker,JSON.stringify(value,null,2)); else fs.unlinkSync(marker);
    }
  }
}
module.exports = { removeRetiredResourcePack };
