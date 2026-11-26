import './search-text.js';
const normalize=globalThis.PubMedNBIBSearch.normalizeTerm;
export const pageKey=value=>{const url=new URL(value);url.hash='';return url.href;};
export const isAlias=value=>/^longquery[a-z0-9_-]+$/i.test(String(value || ''));
export function requestMatchesTerm(details,expected) {
  const matches=value=>typeof value==='string' && normalize(value)===normalize(expected);
  try {if([...new URL(details.url).searchParams.values()].some(matches))return true;} catch {}
  const body=details.requestBody;
  if(Object.values(body?.formData || {}).some(values=>Array.isArray(values) && values.some(matches)))return true;
  try {
    const chunks=(body?.raw || []).filter(part=>part.bytes).map(part=>new Uint8Array(part.bytes));
    const length=chunks.reduce((sum,part)=>sum+part.byteLength,0);
    if(!length || length>4*1024*1024)return false;
    const bytes=new Uint8Array(length);let offset=0;
    for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    const text=new TextDecoder().decode(bytes);
    if(matches(text))return true;
    if([...new URLSearchParams(text).values()].some(matches))return true;
    const find=(value,depth=0)=>{
      if(matches(value))return true;
      if(depth>8 || !value || typeof value!=='object')return false;
      return Object.values(value).some(child=>find(child,depth+1));
    };
    return find(JSON.parse(text));
  } catch {return false;}
}
export function assessResult(pending,message,pageURL) {
  const diagnostics={count:Number.isInteger(message.pageCount)?message.pageCount:null,
    sources:[],expectedLength:normalize(pending.term).length,hasResults:Boolean(message.hasResults),hasExportControls:Boolean(message.hasExportControls)};
  if(message.pageError)return {ok:false,retry:false,code:message.pageError,error:message.pageError==='http-414'?
    '网页明确显示 HTTP 414：PubMed 未能处理本次原生搜索提交。':'网页正在进行浏览器验证，请在专用 PubMed 页手动处理后回工具页重试。',diagnostics};
  if(!message.hasResults || !message.hasExportControls || diagnostics.count===null) {
    const missing=[];
    if(diagnostics.count===null)missing.push('未读到结果总数');
    if(!message.hasResults)missing.push('未识别结果列表标记');
    if(!message.hasExportControls)missing.push('未识别 Send to 按钮');
    return {ok:false,retry:true,code:'loading',error:'结果页识别未完成：'+missing.join('；'),diagnostics};
  }
  const terms=Array.isArray(message.pageTerms)?[...message.pageTerms]:[];
  if(typeof message.pageTerm==='string')terms.push({source:'search-input',value:message.pageTerm});
  let urlTerm='';
  try {urlTerm=new URL(pageURL).searchParams.get('term') || '';if(urlTerm)terms.push({source:'result-url',value:urlTerm});} catch {}
  diagnostics.sources=terms.filter(item=>typeof item.value==='string' && item.value.trim()).map(item=>({source:item.source,length:normalize(item.value).length,alias:isAlias(normalize(item.value))}));
  const exact=terms.find(item=>typeof item.value==='string' && normalize(item.value)===normalize(pending.term));
  if(exact)return {ok:true,method:exact.source,diagnostics};
  const submitted=pending.submission?.confirmed===true;
  let navigated=false;
  try {navigated=pending.searchNavigation?.token===pending.token && pageKey(pending.searchNavigation.url)===pageKey(pageURL) && pending.searchNavigation.time>=pending.submission.confirmedAt;} catch {}
  if(submitted && navigated && pending.submission.requestMatched && (!urlTerm || isAlias(urlTerm)))
    return {ok:true,method:'verified-native-request-and-navigation',diagnostics};
  // PubMed can use an opaque longquery alias while only displaying that alias
  // or no query field at all. Require the exact native form readback checkpoint,
  // an observed navigation in our dedicated tab, native controls and equal count.
  const opaqueOnly=terms.every(item=>!normalize(item.value) || isAlias(normalize(item.value)));
  if(submitted && navigated && isAlias(urlTerm) && opaqueOnly && diagnostics.count===pending.expected)
    return {ok:true,method:'native-submit-alias-navigation-and-count',diagnostics};
  return {ok:false,retry:true,code:'unverified-query',
    error:`已识别正常结果页（${diagnostics.count} 条），但尚未核对检索来源：原文 ${diagnostics.expectedLength} 字符；可读来源 ${diagnostics.sources.map(s=>s.source+':'+s.length+(s.alias?'（短编号）':'')).join('、') || '无'}。`,diagnostics};
}
