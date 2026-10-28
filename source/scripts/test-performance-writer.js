const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sloth-writer-check-'));
const jdk=process.env.JAVA_HOME||'C:/Program Files/Java/jdk-21.0.12.1';
try{
 for(const [tool,args]of [['javac',['-encoding','UTF-8','-d',dir,'client-mod/src/main/java/com/sloth/client/studio/LocalSnapshotWriter.java','scripts/PerformanceWriterCheck.java']],['java',['-cp',dir,'PerformanceWriterCheck',dir]]]){
  const r=cp.spawnSync(path.join(jdk,'bin',tool+'.exe'),args,{stdio:'inherit',timeout:30000});if(r.status!==0)throw Error('Writer regression check failed');
 }
}finally{if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('sloth-writer-check-'))fs.rmSync(dir,{recursive:true,force:true});}
