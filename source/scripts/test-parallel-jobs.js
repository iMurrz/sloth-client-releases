const assert=require('node:assert/strict');
const {parallelJobs}=require('../src/lib/parallel-jobs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  let active=0,peak=0,finished=[];
  await parallelJobs(Array.from({length:20},(_,i)=>i),4,async i=>{
    peak=Math.max(peak,++active);await delay(5);finished.push(i);active--;
  });
  assert.equal(peak,4);assert.equal(active,0);assert.equal(new Set(finished).size,20);
  console.log('PASS four jobs overlap without exceeding the bound or losing work');
  let started=0,settled=0;
  await assert.rejects(parallelJobs([0,1,2,3,4,5],4,async(i,index,signal)=>{
    started++;try{if(i===0){await delay(5);throw Error('Original failure');}
    await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>setTimeout(()=>reject(signal.reason),10),{once:true}));
    }finally{settled++;}
  }),/Original failure/);
  assert.equal(started,4);assert.equal(settled,4);
  console.log('PASS first failure cancels and drains in-flight work before returning');
  const controller=new AbortController();
  const work=parallelJobs([1,2,3,4,5],4,async(i,index,signal)=>{
    await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  },controller.signal);controller.abort(Error('User cancelled'));
  await assert.rejects(work,/User cancelled/);
  console.log('PASS user cancellation propagates to every active job');
  await parallelJobs([],4,()=>{throw Error('Empty work ran');});
  console.log('4/4 parallel download checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
