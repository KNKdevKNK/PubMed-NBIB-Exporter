import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {newNativeJob,runNativeJob} from './runner.mjs';
import {searchEntryURL,ownedPage,isNativeDownload,safeFilename,checkNativeFile} from './native-policy.mjs';
import {split,dateNumber} from './core.mjs';
const nativeURL=term=>'https://pubmed.ncbi.nlm.nih.gov/?term='+encodeURIComponent(term);
let checks=0;const pass=name=>{checks++;console.log('PASS',name);};
const config={term:'asthma[ti]',start:'2024-01-01',end:'2024-01-02',field:'dp',limit:100};
assert.throws(()=>dateNumber('2023-02-29'));
assert.deepEqual(split({start:'2024-02-28',end:'2024-03-01'}),[{start:'2024-02-28',end:'2024-02-29'},{start:'2024-03-01',end:'2024-03-01'}]);pass('inclusive date split and leap day');
assert(safeFilename('PubMedNative_test/0001.nbib'));assert(!safeFilename('PubMedNative_test/../x.nbib'));
assert(!safeFilename('PubMedNative_test/0001.txt'));pass('only safe NBIB output paths');
const pending={token:'t',term:'asthma[ti]',tabId:7,status:'armed'};
assert(ownedPage(pending,{tab:{id:7},url:nativeURL(pending.term)}));
assert(!ownedPage(pending,{tab:{id:8},url:nativeURL(pending.term)}));
assert(!ownedPage(pending,{tab:{id:7},url:nativeURL('other')}));pass('content messages scoped to dedicated tab and exact query');
const item={id:3,url:'https://pubmed.ncbi.nlm.nih.gov/results-export-search-data/',filename:'pubmed-asthma-set.nbib',referrer:nativeURL(pending.term),startTime:new Date().toISOString()};
assert(isNativeDownload(pending,item));assert(!isNativeDownload(pending,{...item,referrer:nativeURL('other')}));
assert(!isNativeDownload(pending,{...item,url:'https://example.com/x.nbib'}));
assert(isNativeDownload({...pending,requests:[{url:item.url,time:Date.now()}]},{...item,referrer:''}));pass('native download association via referrer or observed tab request; no fictional DownloadItem.tabId');
assert.throws(()=>checkNativeFile({...item,filename:'x.txt'}));
assert.throws(()=>checkNativeFile({...item,state:'complete',fileSize:0,bytesReceived:0}));
checkNativeFile({...item,state:'complete',fileSize:99});pass('TXT and empty files cannot be marked as native NBIB success');
function ioFor(search,exportNative) {let persisted;return {check(){},progress(){},search,exportNative,save:async j=>{persisted=structuredClone(j);},get persisted(){return persisted;}};}
{
  const job=newNativeJob(config);
  const search=async(term,max)=>{assert.equal(max,0);return {count:/"2024\/01\/01"\[dp\] : "2024\/01\/02"\[dp\]\)$/.test(term)?150:75};};
  let exports=0;
  const io=ioFor(search,async task=>{exports++;assert(task.filename.endsWith('.nbib'));return {status:'complete',downloadId:exports,actualFilename:task.filename,bytes:100};});
  await runNativeJob(job,io);assert.equal(exports,2);assert.equal(job.status,'complete');assert.equal(job.done.length,2);pass('count-only planning splits over-limit query and exports each leaf natively');
}
{
  const job=newNativeJob(config);let exports=0;
  const io=ioFor(async()=>({count:2}),async()=>{exports++;throw new Error('page blocked');});
  await assert.rejects(runNativeJob(job,io),/page blocked/);
  assert.equal(job.done.length,0);assert.equal(job.pending.length,1);assert(job.active?.token);
  const token=job.active.token;
  io.exportNative=async task=>{assert.equal(task.token,token);return {status:'complete',actualFilename:task.filename,downloadId:5,bytes:200};};
  await runNativeJob(job,io);assert.equal(job.done.length,1);assert.equal(job.active,null);assert.equal(exports,1);
  pass('failed webpage preserves same intent token; completed checkpoint reconciled on resume');
}
{
  const job=newNativeJob(config);let exports=0;
  const io=ioFor(async term=>({count:term.endsWith('"2024/01/02"[dp])') && !term.includes('"2024/01/01"[dp] : "2024/01/01"')?2:1}),async task=>{
    exports++;return exports===1?{status:'needs_split'}:{status:'complete',actualFilename:task.filename,downloadId:exports,bytes:200};
  });
  await runNativeJob(job,io);assert.equal(job.done.length,2);assert.equal(exports,3);pass('website over-limit response forces further splitting instead of truncation');
}
{
  const job=newNativeJob({...config,start:'2024-01-01',end:'2024-01-01'});
  let exports=0;
  const io=ioFor(async()=>({count:0}),async()=>{exports++;});
  await runNativeJob(job,io);assert.equal(exports,0);assert.equal(job.status,'complete');pass('empty results never create a file');
}
async function contentFixture({count=2,selectable=true}={}) {
  let state=0;const actions=[];let finish;
  const completed=new Promise(resolve=>{finish=resolve;});
  const optionPage={value:'page',textContent:'All results on this page'},optionAll={value:'all',textContent:'All results'};
  const select={options:selectable?[optionPage,optionAll]:[optionPage],_value:'page',get value(){return this._value;},set value(v){this._value=v;},get selectedOptions(){return this.options.filter(o=>o.value===this._value);},getClientRects:()=>[{}],getAttribute:()=>null,dispatchEvent(){}};
  const scope={querySelectorAll:selector=>selector==='select'?[select]:[]};
  function button(text,step,next) {return {textContent:text,disabled:false,getAttribute:()=>null,getClientRects:()=>state===step?[{}]:[],closest:selector=>selector==='form'?scope:null,click(){actions.push(text);state=next;if(text==='Create file') finish({actions,select});}};}
  const controls=[button('Send to',0,1),button('Citation manager',1,2),button('Create file',2,3)];
  const document={addEventListener(){},querySelector:selector=>selector==='meta[name="ncbi_resultcount"]'?{content:String(count)}:null,querySelectorAll:()=>controls,getElementById:()=>null};
  const chrome={runtime:{sendMessage:async message=>{
    if(message.type==='native-ready')return {ok:true,value:{token:'t',expected:2}};
    if(message.type==='native-arm') {
      if(message.count!==2) {finish({actions,mismatch:true});return {ok:true,value:{ok:false}};}
      assert.equal(select.value,'all');return {ok:true,value:{ok:true}};
    }
    if(message.type==='native-error')finish({actions,error:message.error});
    return {ok:true,value:{ok:true}};
  }}};
  vm.runInNewContext(await readFile(new URL('./content.js',import.meta.url),'utf8'),{window:{},document,chrome,getComputedStyle:()=>({visibility:'visible'}),Event:class{},setTimeout});
  return await completed;
}
{
  const result=await contentFixture();assert.deepEqual(result.actions,['Send to','Citation manager','Create file']);
  assert.equal(result.select.value,'all');pass('DOM fixture follows native Send to → Citation manager → All results → Create file');
  const blocked=await contentFixture({selectable:false});assert(blocked.error.includes('All results'));assert(!blocked.actions.includes('Create file'));pass('missing All results cannot silently export only current page');
  const mismatch=await contentFixture({count:3});assert(mismatch.mismatch);assert.equal(mismatch.actions.length,0);pass('website count mismatch stops before native export');
}
{
  // Service worker integration: browser-origin native download, not downloads.download().
  let onMessage,onFilename,onChanged;
  const data={};let browserItem;
  const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>{onMessage=fn;}}},
    storage:{local:{get:async key=>({[key]:structuredClone(data[key])}),set:async obj=>{Object.assign(data,structuredClone(obj));},remove:async key=>{delete data[key];}}},
    tabs:{create:async()=>({id:7}),update:async()=>{},query:async()=>[],get:async()=>({id:7,url:'https://pubmed.ncbi.nlm.nih.gov/'}),onRemoved:{addListener(){}}},
    action:{onClicked:{addListener(){}}},webRequest:{onBeforeRequest:{addListener(){}},onCompleted:{addListener(){}}},
    downloads:{download:()=>{throw new Error('must not generate native downloads from extension');},search:async()=>[browserItem],onDeterminingFilename:{addListener:fn=>{onFilename=fn;}},onChanged:{addListener:fn=>{onChanged=fn;}}}};
  globalThis.chrome=chrome;await import('./background.js');
  const ui={id:'test',url:'chrome-extension://test/index.html'};
  async function send(message,sender=ui) {const reply=await new Promise(resolve=>{onMessage(message,sender,resolve);});assert(reply.ok,reply.error);return reply.value;}
  await send({type:'native-start',token:'x',term:'asthma[ti]',expected:2,filename:'PubMedNative_test/0001.nbib'});
  const entry={id:'test',tab:{id:7},url:searchEntryURL('x')};
  const prepare=await send({type:'native-ready',pageTerm:''},entry);assert.equal(prepare.action,'submit-search');
  await send({type:'native-search-submitted',token:'x'},entry);
  const page={id:'test',tab:{id:7,url:nativeURL('asthma[ti]')},url:nativeURL('asthma[ti]')};
  await send({type:'native-ready',pageTerm:'asthma[ti]'},page);await send({type:'native-arm',token:'x',count:2},page);
  browserItem={...item,id:44,state:'in_progress',bytesReceived:0};
  const suggestion=await new Promise(resolve=>onFilename(browserItem,resolve));
  assert.equal(suggestion.filename,'PubMedNative_test/0001.nbib');
  browserItem={...browserItem,state:'complete',filename:'C:/Downloads/PubMedNative_test/0001.nbib',bytesReceived:321,fileSize:321};
  onChanged({id:44,state:{current:'complete'}});
  const result=await send({type:'native-status',token:'x'});
  assert.equal(result.status,'complete');assert.equal(result.bytes,321);assert.equal(result.downloadId,44);assert.equal(result.originalFilename,item.filename);
  const again=await send({type:'native-start',token:'x',term:'asthma[ti]',expected:2,filename:'PubMedNative_test/0001.nbib'});
  assert.equal(again.downloadId,44);
  const longTerm=Array.from({length:2000},(_,i)=>`disease${i}[tiab]`).join(' OR ');
  const longTask={type:'native-start',token:'long-token',term:longTerm,expected:2,filename:'PubMedNative_test/0002.nbib'};
  const longPending=await send(longTask);
  assert(longPending.entryURL.length<200);assert(!longPending.entryURL.includes('disease'));
  const longEntry={id:'test',tab:{id:7},url:longPending.entryURL};
  const input=await send({type:'native-ready',pageTerm:''},longEntry);assert.equal(input.term,longTerm);
  await send({type:'native-search-submitted',token:'long-token'},longEntry);
  const aliasURL=nativeURL('longquery-test-generated-by-pubmed');
  const aliasPage={id:'test',tab:{id:7},url:aliasURL};
  const verified=await send({type:'native-ready',pageTerm:longTerm},aliasPage);
  assert.equal(verified.action,'export');assert.equal(verified.resultURL,aliasURL);
  await send({type:'native-arm',token:'long-token',count:2},aliasPage);
  browserItem={...item,id:45,state:'in_progress',referrer:aliasURL,bytesReceived:0};
  const aliasSuggestion=await new Promise(resolve=>onFilename(browserItem,resolve));
  assert.equal(aliasSuggestion.filename,'PubMedNative_test/0002.nbib');
  browserItem={...browserItem,state:'complete',filename:'C:/Downloads/PubMedNative_test/0002.nbib',bytesReceived:321,fileSize:321};
  onChanged({id:45,state:{current:'complete'}});
  assert.equal((await send({type:'native-status',token:'long-token'})).status,'complete');
  pass('long-query homepage handshake verifies full displayed query and accepts PubMed-generated short alias download');
  // Requests left open by 2.0.0 must become retryable, not wait indefinitely.
  data.nativePending={token:'legacy',status:'opening',tabId:7,updated:Date.now()};
  const legacy=await send({type:'native-status',token:'legacy'});
  assert.equal(legacy.status,'error');assert(legacy.error.includes('重试'));
  pass('pre-fix pending GET navigation becomes retryable after upgrade');
  delete globalThis.chrome;
  pass('service worker renames original native download, verifies completion, and resumes without re-export');
}

{
  const token=crypto.randomUUID();const url=searchEntryURL(token);
  assert(url.length<200);assert.equal(new URL(url).searchParams.has('term'),false);
  assert.equal(new URL(url).searchParams.get('pmnbib'),token);
  pass('entry URL is short and carries no search query at all');
}
{
  const fullTerm=Array.from({length:2000},(_,i)=>`asthma${i}[tiab]`).join(' OR ');
  const events=[];let resolveFinished;
  const finished=new Promise(resolve=>{resolveFinished=resolve;});
  const button={type:'submit',disabled:false,textContent:'Search',getAttribute:()=>null,getClientRects:()=>[{}],click(){events.push('native-search-click');resolveFinished();}};
  const form={action:'https://pubmed.ncbi.nlm.nih.gov/',method:'get',querySelectorAll:()=>[button]};
  const field={value:'',form,getClientRects:()=>[{}],focus(){},dispatchEvent(event){events.push(event.type);}};
  const document={querySelector:()=>field};
  const chrome={runtime:{sendMessage:async message=>{
    if(message.type==='native-ready')return {ok:true,value:{action:'submit-search',token:'long',term:fullTerm}};
    if(message.type==='native-search-submitted'){events.push('checkpoint-before-submit');return {ok:true,value:{ok:true}};}
    if(message.type==='native-error'){resolveFinished();throw new Error(message.error);}
    return {ok:true,value:{ok:true}};
  }}};
  vm.runInNewContext(await readFile(new URL('./content.js',import.meta.url),'utf8'),{window:{},document,chrome,location:{href:searchEntryURL('long')},URL,getComputedStyle:()=>({visibility:'visible'}),Event:class{constructor(type){this.type=type;}},setTimeout});
  await finished;
  assert.equal(field.value,fullTerm);assert.equal(form.method,'get');
  assert.deepEqual(events,['input','change','checkpoint-before-submit','native-search-click']);
  pass('long term is entered intact and submitted via original website handlers without rewriting form method or constructing a long GET');
}
for(const filename of ['api.mjs','app.mjs','background.js','content.js','runner.mjs']) {
  const source=await readFile(new URL(filename,import.meta.url),'utf8');
  assert(!/efetch|rettype:\s*['"]medline|parseNBIB/i.test(source));
}
pass('native implementation contains no EFetch, MEDLINE assembly, or NBIB content rewriting');
console.log(`${checks} checks passed. These are offline fixtures, not a live PubMed/EndNote integration test.`);
