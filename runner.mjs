import {validate,nodeTerm,rootTerm,split} from './core.mjs';
export function newNativeJob(config) {
  validate(config);
  return {config,mode:'pubmed-native-send-to',created:new Date().toISOString(),
    folder:'PubMedNative_'+new Date().toISOString().replace(/[-:.]/g,'')+'_'+crypto.randomUUID().slice(0,6),
    pending:[{start:config.start,end:config.end}],done:[],active:null,total:null,status:'ready',warnings:[]};
}
export async function runNativeJob(job,io) {
  job.status='running';delete job.error;await io.save(job);
  if(job.total===null) {job.total=(await io.search(rootTerm(job.config),0)).count;await io.save(job);}
  while(job.pending.length) {
    io.check();
    const node=job.pending[0];
    if(!job.active) {
      io.progress(`检查 ${node.start} → ${node.end}`);
      const term=nodeTerm(job.config,node);
      const {count}=await io.search(term,0);io.check();
      if(count>job.config.limit) {job.pending.splice(0,1,...split(node));await io.save(job);continue;}
      if(!count) {job.pending.shift();await io.save(job);continue;}
      const index=job.done.length+1;
      const filename=`${String(index).padStart(4,'0')}_${node.start}_${node.end}${node.lo===undefined?'':`_PMID-${node.lo}-${node.hi}`}_${count}篇.nbib`;
      job.active={token:crypto.randomUUID(),term,expected:count,node,index,filename:`${job.folder}/${filename}`};
      // Save the intent before opening PubMed. A reload reconciles the same token.
      await io.save(job);
    }
    const task=job.active;
    const result=await io.exportNative(task);
    if(result.status==='needs_split') {
      job.pending.splice(0,1,...split(node));job.active=null;await io.save(job);continue;
    }
    if(result.status!=='complete') throw new Error(result.error || 'PubMed 原生文件导出未完成。');
    if(job.done.some(part=>part.token===task.token)) throw new Error('重复提交同一分段，已停止。');
    const part={...task,downloadId:result.downloadId,originalFilename:result.originalFilename,
      actualFilename:result.actualFilename,sourceURL:result.sourceURL,bytes:result.bytes,
      note:'篇数为网页导出前显示的数量；未读取或改写原生文件内容。'};
    const next={...job,done:[...job.done,part],pending:job.pending.slice(1),active:null};
    await io.save(next);Object.assign(job,next);
    io.check();
  }
  job.finalCount=(await io.search(rootTerm(job.config),0)).count;
  job.status=job.finalCount===job.total?'complete':'review';
  if(job.status==='review') job.warnings.push(`检索期间数据库数量变化：开始 ${job.total}，结束 ${job.finalCount}，请核对。`);
  job.finished=new Date().toISOString();await io.save(job);
}
