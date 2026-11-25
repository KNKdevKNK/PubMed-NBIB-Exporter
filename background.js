import {assessResult,requestMatchesTerm} from './result-check.mjs';
import './search-text.js';
const normalizeTerm=globalThis.PubMedNBIBSearch.normalizeTerm;
import {terminal,searchEntryURL,samePubMedTab,ownedPage,isNativeDownload,safeFilename,checkNativeFile} from './native-policy.mjs';
let queue = Promise.resolve();
function serial(fn) {const result=queue.then(fn);queue=result.catch(()=>{});return result;}
const load = async()=> (await chrome.storage.local.get('nativePending')).nativePending;
const save = async value=>chrome.storage.local.set({nativePending:value});
async function refresh(pending) {
  if (!pending || terminal.has(pending.status)) return pending;
  if ((pending.navigationVersion || 0)<3 && pending.downloadId===undefined) {
    pending.status='error';pending.error='已升级结果页核对方式，请重试当前分段；已保存的文件会保留。';await save(pending);return pending;
  }
  if (pending.downloadId !== undefined) {
    const [item] = await chrome.downloads.search({id:pending.downloadId});
    if (item?.state === 'complete') {
      try {checkNativeFile(item); pending.status='complete';pending.actualFilename=item.filename;pending.bytes=item.fileSize || item.bytesReceived;}
      catch(error) {pending.status='error';pending.error=error.message;}
      await save(pending);
    } else if (item?.state === 'interrupted') {pending.status='error';pending.error='原生下载中断：'+item.error;await save(pending);}
  }
  if (!terminal.has(pending.status) && Date.now()-pending.updated>600000) {
    pending.status='error';pending.error='原生导出等待超过 10 分钟。请检查 PubMed 标签页、验证页面及浏览器下载列表，再重试。';await save(pending);
  }
  return pending;
}
async function handle(message,sender) {
  const ui = sender.id===chrome.runtime.id && sender.url===chrome.runtime.getURL('index.html');
  let pending = await load();
  if (message.type==='native-start') {
    if (!ui) throw new Error('请求必须来自本插件操作页。');
    if (!safeFilename(message.filename) || !Number.isInteger(message.expected) || message.expected<1 || message.expected>9999 || typeof message.term!=='string') throw new Error('原生导出参数无效。');
    if (pending?.token===message.token) return await refresh(pending);
    pending=await refresh(pending);
    if (pending && !terminal.has(pending.status)) throw new Error('上一段仍在网页导出中，请先等待它结束。');
    // Only reuse a helper tab owned by this exporter and still showing PubMed.
    let tab;
    if (pending?.tabId!==undefined) {
      try {const previous=await chrome.tabs.get(pending.tabId);if(previous.url?.startsWith('https://pubmed.ncbi.nlm.nih.gov/')) tab=previous;} catch {}
    }
    if (!tab) tab=await chrome.tabs.create({url:'about:blank',active:true});
    pending={token:message.token,term:message.term,expected:message.expected,filename:message.filename,
      tabId:tab.id,navigationVersion:3,entryURL:searchEntryURL(message.token),status:'opening',stage:'正在打开 PubMed 首页，准备通过原生表单提交检索式',updated:Date.now()};
    await save(pending);
    await chrome.tabs.update(tab.id,{url:pending.entryURL});
    return pending;
  }
  if(message.type==='native-status') {
    if(!ui) throw new Error('来源无效。');
    if(pending?.token!==message.token) return null;
    return await refresh(pending);
  }
  if(message.type==='native-retry') {
    if(!ui || pending?.token!==message.token) throw new Error('来源或任务无效。');
    pending=await refresh(pending);
    // Do not retry completed or ambiguous active downloads automatically.
    if(pending.status==='error') {await chrome.storage.local.remove('nativePending');return {ok:true};}
    return {ok:false,status:pending.status};
  }
  if(message.type==='native-ready') {
    if(!samePubMedTab(pending,sender)) return null;
    const url=new URL(sender.url || sender.tab.url);
    if(pending.status==='opening' && url.href===pending.entryURL) {
      pending.status='preparing';pending.stage='将完整检索式填入 PubMed 原生搜索表单';pending.updated=Date.now();await save(pending);
      return {...pending,action:'submit-search'};
    }
    if(pending.status!=='searching') return null;
    const verdict=assessResult(pending,message,url.href);
    pending.verification={...verdict.diagnostics,method:verdict.method || null,code:verdict.code || 'verified'};
    if(!verdict.ok) {
      if(verdict.retry) {
        pending.verificationStarted ??= Date.now();
        if(Date.now()-pending.verificationStarted<30000) {
          pending.stage=verdict.error;pending.updated=Date.now();await save(pending);
          return {action:'wait-results',token:pending.token};
        }
      }
      pending.status='error';pending.error=verdict.error+(verdict.retry?' 30 秒内未能完成核对，已停止以避免导错文献。':'');await save(pending);return null;
    }
    pending.resultURL=url.href;pending.status='working';pending.stage='结果页检索来源已核对，正在准备原生导出';pending.updated=Date.now();await save(pending);
    return {...pending,action:'export'};
  }
  if(!ownedPage(pending,sender)) return null;
  if(message.type==='native-search-submitted') {
    if(message.token!==pending.token || pending.status!=='preparing' || (sender.url || sender.tab.url)!==pending.entryURL) return null;
    if(typeof message.submittedTerm!=='string' || normalizeTerm(message.submittedTerm)!==normalizeTerm(pending.term)) throw new Error('原生表单提交前的完整检索式未通过核对。');
    pending.submission={confirmed:true,confirmedAt:Date.now(),requestMatched:false};
    pending.status='searching';pending.stage='正在由 PubMed 原生表单处理检索式';pending.updated=Date.now();await save(pending);return {ok:true};
  }
  if(message.token!==pending.token || terminal.has(pending.status)) return null;
  if(message.type==='native-stage') {
    pending.stage=String(message.stage).slice(0,300);pending.updated=Date.now();await save(pending);return {ok:true};
  }
  if(message.type==='native-arm') {
    if(message.count>9999) {pending.status='needs_split';pending.actualCount=message.count;}
    else if(message.count!==pending.expected) {pending.status='error';pending.error=`网页显示 ${message.count} 条，接口预计 ${pending.expected} 条。可能有网页侧栏过滤器或数据库更新；已停止，避免漏导。请清除网页筛选后重试。`;}
    else {pending.status='armed';pending.stage='已选择 All results，等待 PubMed 原生下载';}
    pending.updated=Date.now();await save(pending);return {ok:pending.status==='armed',status:pending.status};
  }
  if(message.type==='native-link') {
    if(pending.status!=='armed' || !/^blob:https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//.test(message.url || '')) return null;
    pending.requests=[...(pending.requests || []).slice(-9),{url:message.url,time:Date.now()}];await save(pending);return {ok:true};
  }
  if(message.type==='native-error') {
    pending.status='error';pending.error=String(message.error);pending.updated=Date.now();await save(pending);return {ok:true};
  }
  return null;
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(sender.id!==chrome.runtime.id || !message?.type?.startsWith('native-')) return;
  serial(()=>handle(message,sender)).then(value=>sendResponse({ok:true,value}),error=>sendResponse({ok:false,error:error.message}));
  return true;
});
chrome.downloads.onDeterminingFilename.addListener((item,suggest)=>{
  serial(async()=>{
    const pending=await load();
    if(!isNativeDownload(pending,item) || (pending.downloadId!==undefined && pending.downloadId!==item.id)) return null;
    try {checkNativeFile(item);} catch(error) {pending.status='error';pending.error=error.message;await save(pending);return null;}
    pending.downloadId=item.id;pending.originalFilename=item.filename;pending.sourceURL=item.url;
    pending.status='downloading';pending.stage='正在保存 PubMed 原生 NBIB';pending.updated=Date.now();await save(pending);
    return {filename:pending.filename,conflictAction:'uniquify'};
  }).then(value=>suggest(value || undefined),()=>suggest());
  return true;
});
chrome.downloads.onChanged.addListener(()=>{serial(async()=>{await refresh(await load());}).catch(()=>{});});
chrome.tabs.onRemoved.addListener(tabId=>{serial(async()=>{
  const pending=await load();
  if(pending?.tabId===tabId && !terminal.has(pending.status) && pending.downloadId===undefined) {
    pending.status='error';pending.error='原生导出标签页已关闭，请重试当前分段。';await save(pending);
  }
}).catch(()=>{});});
chrome.action.onClicked.addListener(async()=>{
  const url=chrome.runtime.getURL('index.html');const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);
  if(tab) {await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});}
  else await chrome.tabs.create({url});
});

// Observe request metadata only, without modifying requests or response bodies.
chrome.webRequest.onBeforeRequest.addListener(details=>{
  serial(async()=>{
    const pending=await load();
    if(pending?.tabId!==details.tabId) return;
    if(pending.status==='searching') {
      if(pending.submission?.confirmed && requestMatchesTerm(details,pending.term)) pending.submission.requestMatched=true;
      if(details.type==='main_frame' && pending.submission?.confirmed && (!pending.searchNavigation || pending.searchNavigation.requestId===details.requestId)) pending.searchNavigation={url:details.url,time:details.timeStamp,token:pending.token,requestId:details.requestId};
      await save(pending);return;
    }
    if(pending.status!=='armed')return;
    pending.requests=[...(pending.requests || []).slice(-19),{url:details.url,time:details.timeStamp}];
    await save(pending);
  }).catch(()=>{});
},{urls:['https://pubmed.ncbi.nlm.nih.gov/*']},['requestBody']);

chrome.webRequest.onCompleted.addListener(details=>{
  if(details.statusCode!==414) return;
  serial(async()=>{
    const pending=await load();
    if(pending?.tabId!==details.tabId || terminal.has(pending.status)) return;
    pending.status='error';pending.error='PubMed 返回 HTTP 414（网址过长）。本版已使用网页原生表单；请确认已更新并关闭旧工具页，再重试。';await save(pending);
  }).catch(()=>{});
},{urls:['https://pubmed.ncbi.nlm.nih.gov/*'],types:['main_frame']});
