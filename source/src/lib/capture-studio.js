const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const library=require('./library');
const tools=require('./file-tools');
const ALBUM=/^[A-Za-z0-9 _-]{1,40}$/;
async function albums(root){
  const file=path.join(root,'screenshots','.sloth-albums.json');await tools.guard(root,file,true);
  try{const stat=await fs.stat(file);if(stat.size>512*1024)throw new Error('Album index exceeds its size limit.');const text=await fs.readFile(file,'utf8');if(Buffer.byteLength(text)>512*1024)throw new Error('Album index exceeds its size limit.');const data=JSON.parse(text);return data&&typeof data==='object'&&!Array.isArray(data)?Object.fromEntries(Object.entries(data).filter(([name,album])=>/\.(?:png|jpe?g)$/i.test(name)&&typeof album==='string'&&ALBUM.test(album))):{};}catch(e){if(e.code==='ENOENT')return {};throw e;}
}
async function assign(root,name,album){
  library.screenshotPath(root,name);if(typeof album!=='string'||album!==album.trim()||album&&!ALBUM.test(album))throw new Error('Use 1–40 letters, numbers, spaces, - or _ for an album.');
  const data=await albums(root);if(Object.keys(data).length>=10000&&!Object.hasOwn(data,name))throw new Error('Album index is full.');
  if(album)data[name]=album;else delete data[name];if(Buffer.byteLength(JSON.stringify(data))>512*1024)throw new Error('Album index exceeds its size limit.');const file=path.join(root,'screenshots','.sloth-albums.json'),temp=file+'.'+crypto.randomUUID()+'.partial';
  try{await fs.writeFile(temp,JSON.stringify(data),{flag:'wx'});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}return true;
}
async function load(root,name,nativeImage){
  const file=library.screenshotPath(root,name),stat=await fs.stat(file);
  // Reuse the library's header/dimension inspection before decoding the original.
  const page=await library.screenshotPage(root,nativeImage,{query:name,limit:60});
  if(stat.size>32*1024*1024||!page.items.find(i=>i.name===name)?.thumb)throw new Error('This screenshot cannot be edited within the image size limit.');
  const image=nativeImage.createFromPath(file);if(image.isEmpty())throw new Error('Could not decode this screenshot.');
  const size=image.getSize();if(size.width*size.height>16*1024*1024)throw new Error('Image exceeds 16 megapixels.');
  const index=await albums(root).catch(()=>({}));return {name,...size,data:image.toDataURL(),album:index[name]||''};
}
async function save(root,name,data,nativeImage){
  library.screenshotPath(root,name);
  if(typeof data!=='string'||data.length>48*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data))throw new Error('Edited screenshot must be a PNG under 32 MB.');
  const bytes=Buffer.from(data.slice(data.indexOf(',')+1),'base64');
  if(bytes.length>32*1024*1024||bytes.length<24||bytes.readUInt32BE(0)!==0x89504e47||bytes.readUInt32BE(4)!==0x0d0a1a0a||bytes.toString('ascii',12,16)!=='IHDR'||!bytes.readUInt32BE(16)||!bytes.readUInt32BE(20)||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>16*1024*1024)throw new Error('Invalid or oversized PNG.');
  const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw new Error('Could not decode edited PNG.');
  const folder=path.join(root,'screenshots');await tools.guard(root,folder);
  const stem=path.basename(name,path.extname(name)).slice(0,90),saved=`${stem}-edited-${crypto.randomBytes(5).toString('hex')}.png`;
  const png=image.toPNG();if(png.length>32*1024*1024)throw new Error('The normalized PNG exceeds 32 MB. Crop to a smaller image first.');await fs.writeFile(path.join(folder,saved),png,{flag:'wx'});return {name:saved};
}
module.exports={albums,assign,load,save};
