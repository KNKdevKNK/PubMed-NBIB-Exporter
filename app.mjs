import {PubMedAPI} from './api.mjs';
import {newNativeJob,runNativeJob} from './runner.mjs';
const $=id=>document.getElementById(id);
let job,running=true,pause=false;
const labels={ready:'准备就绪',running:'正在原生导出',paused:'已暂停',error:'已停止，可重试',complete:'原生分段已完成',review:'分段已完成，数量需核对'};
const message=text=>{$('message').textContent=text;};
const check=()=>{if(pause) throw new Error('已在当前分段完成后暂停。');};
async function save(value) {await chrome.storage.local.set({nativeJob:value});}
async function rpc(type,data={}) {
  const response=await chrome.runtime.sendMessage({type,...data});
  if(!response?.ok) throw new Error(response?.error || '插件后台无响应，请重新加载插件。');
  return response.value;
}
function render() {
  for(const id of ['term','start','end','field','limit','startButton']) $(id).disabled=running;
  $('pause').disabled=!running || pause;
  $('resume').disabled=running || !job || ['complete','review'].includes(job.status);
  $('audit').disabled=running || !job;
  if(!job) return;
  $('status').textContent=labels[job.status] || job.status;
  $('total').textContent=job.total===null?'—':job.total.toLocaleString();
  const records=job.done.reduce((sum,p)=>sum+p.expected,0);
  $('records').textContent=records.toLocaleString();$('files').textContent=job.done.length;
  $('progress').max=Math.max(1,job.total || 1);$('progress').value=Math.min(records,$('progress').max);
  $('warning').textContent=[...job.warnings,job.error || '', '保留原生文件内容，未做跨段去重；篇数为网页导出前的显示数量，不是读取文件后的实测数量。'].filter(Boolean).join('\n');
  $('folder').textContent='默认下载目录 / '+job.folder;
  $('parts').replaceChildren(...job.done.map(p=>{
    const row=document.createElement('tr');
    for(const value of [`${p.node.start} → ${p.node.end}${p.node.lo===undefined?'':` / PMID ${p.node.lo}–${p.node.hi}`}`,p.expected,p.actualFilename]) {
      const cell=document.createElement('td');cell.textContent=value;row.append(cell);
    }
    return row;
  }));
}
async function exportNative(task) {
  let state=await rpc('native-status',{token:task.token});
  // The user explicitly clicked Continue/Retry. A completed download is reconciled,
  // never fetched again; only a recorded error is eligible to retry.
  if(state?.status==='error') {await rpc('native-retry',{token:task.token});state=null;}
  if(!state) state=await rpc('native-start',task);
  while(state && !['complete','error','needs_split','cancelled'].includes(state.status)) {
    message(`${task.node.start} → ${task.node.end}：${state.stage}${pause?'（本段完成后暂停）':''}`);
    await new Promise(resolve=>setTimeout(resolve,750));
    state=await rpc('native-status',{token:task.token});
  }
  if(!state) throw new Error('当前原生导出状态丢失，请检查下载列表再重试，避免重复文件。');
  return state;
}
async function execute() {
  running=true;pause=false;delete job.error;render();
  const api=new PubMedAPI({check,progress:message});
  try {
    await runNativeJob(job,{check,progress:message,
      search:async(term,max)=>{
        const result=await api.search(term,max);
        if(Object.keys(api.lastWarnings || {}).length) {
          const warning='PubMed 检索提示：'+JSON.stringify(api.lastWarnings);
          if(!job.warnings.includes(warning)) job.warnings.push(warning);
        }
        return result;
      },
      save:async value=>{await save(value);render();},exportNative});
    message(job.status==='complete'?'原生分段下载完成。请保存任务清单，并将 NBIB 导入 EndNote 后去重。':'分段已完成，但检索期间数量变化，请核对任务清单。');
  } catch(error) {
    job.status=pause?'paused':'error';job.error=error.message;
    try {await save(job);} catch {}
    message(pause?'任务已暂停，可继续。':'任务已停止，当前分段保留。请检查专用 PubMed 标签页，再点击继续 / 重试。');
  } finally {running=false;render();}
}
$('form').addEventListener('submit',async event=>{
  event.preventDefault();
  try {
    const config={term:$('term').value,start:$('start').value,end:$('end').value,field:$('field').value,limit:Number($('limit').value)};
    const next=newNativeJob(config);
    if(job?.active) {
      const state=await rpc('native-status',{token:job.active.token});
      if(state && !['error','cancelled','needs_split'].includes(state.status)) throw new Error('上次任务仍有待核对的原生导出。请先继续，使当前分段完成，再开始新任务。');
    }
    if(job && !confirm('开始新任务将替换上次任务进度记录，已下载文件保留。继续吗？')) return;
    running=true;render();await save(next);job=next;await execute();
  } catch(error) {running=false;message(error.message);render();}
});
$('resume').addEventListener('click',execute);
$('pause').addEventListener('click',()=>{pause=true;render();message('当前网页导出和保存完成后暂停，请保持专用 PubMed 标签页打开。');});
$('audit').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(job,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=job.folder+'_任务清单.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
});
window.addEventListener('beforeunload',event=>{if(running){event.preventDefault();event.returnValue='';}});
$('end').value=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());render();
navigator.locks.request('pubmed-native-single-runner',{ifAvailable:true},async lock=>{
  if(!lock) {message('已有原生导出工具页在运行，请关闭本页，使用原来的工具页。');return;}
  try {
    job=(await chrome.storage.local.get('nativeJob')).nativeJob;
    if(job) {
      if(job.status==='running') job.status='paused';
      for(const id of ['term','start','end','field','limit']) $(id).value=job.config[id];
      message('已载入原生导出任务；继续时会先核对上一段的下载结果。');
    }
    running=false;render();
  } catch(error) {message('无法读取本地进度：'+error.message);}
  await new Promise(()=>{});
});
