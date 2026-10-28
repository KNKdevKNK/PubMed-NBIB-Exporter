export const terminal = new Set(['complete','error','needs_split','cancelled']);
// Never put the query in the navigation URL. PubMed's own search form handles
// long queries (including its session-specific longquery aliases).
export function searchEntryURL(token) {
  const url = new URL('https://pubmed.ncbi.nlm.nih.gov/');
  url.searchParams.set('pmnbib',token);
  return url.href;
}
export function samePubMedTab(pending,sender) {
  if(!pending || sender.tab?.id!==pending.tabId) return false;
  try {return new URL(sender.url || sender.tab.url).origin==='https://pubmed.ncbi.nlm.nih.gov';}
  catch {return false;}
}
const pageIdentity=value=>{const url=new URL(value);url.hash='';return url.href;};
export function ownedPage(pending, sender) {
  if (!samePubMedTab(pending,sender)) return false;
  try {
    const url = new URL(sender.url || sender.tab.url);
    return (pending.entryURL && pageIdentity(url.href) === pageIdentity(pending.entryURL)) ||
      (pending.resultURL && pageIdentity(url.href) === pageIdentity(pending.resultURL)) ||
      url.searchParams.get('term') === pending.term;
  } catch {return false;}
}
export function isNativeDownload(pending, item) {
  if (!pending || !['armed','downloading'].includes(pending.status)) return false;
  const source=/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//.test(item.url || '') ||
    /^blob:https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//.test(item.url || '');
  if(!source) return false;
  // DownloadItem has no tabId. Associate a full referrer or a request actually
  // observed in our dedicated PubMed tab; never rely on an invented property.
  try {
    const referrer=new URL(item.referrer);
    if(referrer.origin==='https://pubmed.ncbi.nlm.nih.gov' && ((pending.resultURL && pageIdentity(referrer.href)===pageIdentity(pending.resultURL)) || referrer.searchParams.get('term')===pending.term)) return true;
  } catch {}
  const started=Date.parse(item.startTime);
  return Boolean(pending.requests?.some(request=>request.url===item.url &&
    Number.isFinite(started) && Math.abs(started-request.time)<30000));
}
export function safeFilename(filename) {
  return typeof filename === 'string' && /^PubMedNative_[^/]+\/[^/]+\.nbib$/.test(filename) && !filename.includes('..') && !filename.includes('\\');
}
export function checkNativeFile(item) {
  if (!/\.nbib$/i.test(item.filename || '')) throw new Error('PubMed 下载没有 .nbib 后缀，已停止；不会把 TXT 改名冒充原生 NBIB。');
  if (item.state === 'complete' && !(item.fileSize > 0 || item.bytesReceived > 0)) throw new Error('下载文件为空，请检查 PubMed 页面。');
}
