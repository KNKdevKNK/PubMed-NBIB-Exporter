(() => {
  if (window.__pubmedNativeExporter) return;
  window.__pubmedNativeExporter=true;
  const normalizeTerm=globalThis.PubMedNBIBSearch.normalizeTerm;
  const visible=el=>Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden');
  const normalize=text=>String(text || '').replace(/\s+/g,' ').trim();
  const label=el=>normalize(el.getAttribute('aria-label')) || normalize(el.textContent) || normalize(el.value);
  const control=pattern=>[...document.querySelectorAll('button,a,[role="button"],[role="menuitem"],input[type="submit"]')]
    .find(el=>visible(el) && !el.disabled && pattern.test(label(el)));
  async function waitFor(getter,description,timeout=30000) {
    const deadline=Date.now()+timeout;
    do {
      const value=getter();if(value) return value;
      await new Promise(resolve=>setTimeout(resolve,300));
    } while(Date.now()<deadline);
    throw new Error('未找到网页控件：'+description+'。请查看 PubMed 原生导出标签页；若有验证页面请手动处理，然后回工具页重试。');
  }
  async function rpc(type,data={}) {
    const response=await chrome.runtime.sendMessage({type,...data});
    if(!response?.ok) throw new Error(response?.error || '插件后台连接失败，请重新加载插件。');
    return response.value;
  }
  function countResults() {
    const meta=document.querySelector('meta[name="ncbi_resultcount"]');
    const values=[meta?.content,
      document.querySelector('.results-amount .value')?.textContent,
      document.querySelector('.results-amount')?.textContent];
    for(const value of values) {
      const match=String(value || '').match(/\d[\d,]*/);
      if(match) return Number(match[0].replaceAll(',',''));
    }
    return null;
  }
  function searchField() {
    const selector='input#id_term, textarea#id_term, input[name="term"], textarea[name="term"]';
    return [...document.querySelectorAll(selector)].find(field=>
      typeof field.value==='string' && !field.disabled && !field.readOnly && field.type!=='hidden' && visible(field));
  }
  function displayedTerm() {return normalizeTerm(searchField()?.value || '');}
  function setSearchValue(field,value) {
    // Use the browser's native setter when a page framework wraps .value.
    const view=field.ownerDocument?.defaultView;
    const prototype=field.tagName==='TEXTAREA'?view?.HTMLTextAreaElement?.prototype:view?.HTMLInputElement?.prototype;
    const setter=prototype && Object.getOwnPropertyDescriptor(prototype,'value')?.set;
    if(setter) setter.call(field,value);else field.value=value;
  }
  async function submitSearch(task) {
    const data={token:task.token};
    try {
      const field=await waitFor(()=>{const value=searchField();return visible(value)?value:null;},'PubMed 搜索框');
      const form=field.form || field.closest('form');
      if(!form || new URL(form.action || location.href,location.href).origin!=='https://pubmed.ncbi.nlm.nih.gov') throw new Error('未找到 PubMed 原生搜索表单。');
      // Preserve the site's method and submit handlers. They can turn a long
      // search into PubMed's own short longquery URL. Never construct that token.
      const expected=normalizeTerm(task.term);
      field.focus();setSearchValue(field,expected);
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.dispatchEvent(new Event('change',{bubbles:true}));
      const actual=normalizeTerm(field.value);
      if(actual!==expected) throw new Error(`搜索框内容被截短或修改，已停止（预计 ${expected.length} 字符，实际 ${actual.length} 字符）。`);
      const button=[...form.querySelectorAll('button,input[type="submit"]')].find(el=>visible(el) && !el.disabled &&
        (el.type==='submit' || /^Search$/i.test(label(el))));
      if(!button && typeof form.requestSubmit!=='function') throw new Error('找不到原生搜索按钮。');
      const armed=await rpc('native-search-submitted',{...data,submittedTerm:expected});
      if(!armed?.ok) throw new Error('无法确认搜索提交状态，请重试。');
      if(normalizeTerm(searchField()?.value)!==expected) throw new Error('搜索框在提交前被网页改动，已停止，请重试。');
      if(button) button.click();else form.requestSubmit();
    } catch(error) {await rpc('native-error',{...data,error:error.message});}
  }
  function resultEvidence() {
    const terms=[];
    for(const field of document.querySelectorAll('input#id_term, textarea#id_term, input[name="term"], textarea[name="term"]')) {
      if(typeof field.value==='string')terms.push({source:visible(field)?'visible-search-field':'hidden-search-field',value:field.value});
    }
    for(const meta of document.querySelectorAll('meta[name="ncbi_term"],meta[name="ncbi_query"]')) {
      if(meta.content)terms.push({source:'meta-'+meta.name,value:meta.content});
    }
    const pageCount=countResults();
    const title=document.title || '';
    const heading=document.querySelector('h1')?.textContent || '';
    let pageError=null;
    if(/Submitted URI too large|Error 414/i.test(title+' '+heading))pageError='http-414';
    else if(pageCount===null && /checking your browser|recaptcha|verify you are human/i.test(title+' '+heading))pageError='verification-page';
    return {pageTerm:displayedTerm(),pageTerms:terms,pageCount,hasResults:pageCount!==null,
      hasExportControls:Boolean(control(/^Send to/i)),pageError};
  }
  async function run() {
    let task;
    do {
      task=await rpc('native-ready',resultEvidence());
      if(task?.action==='wait-results')await new Promise(resolve=>setTimeout(resolve,750));
    } while(task?.action==='wait-results');
    if(!task)return;
    if(task.action==='submit-search') {await submitSearch(task);return;}
    const data={token:task.token};
    document.addEventListener('click',event=>{
      const anchor=event.target.closest?.('a');
      if(anchor?.href?.startsWith('blob:https://pubmed.ncbi.nlm.nih.gov/')) rpc('native-link',{...data,url:anchor.href}).catch(()=>{});
    },true);
    const stage=text=>rpc('native-stage',{...data,stage:text});
    try {
      const wrapper=await waitFor(()=>{const count=countResults();return count===null?null:{count};},'PubMed 结果数量');
      const count=wrapper.count;
      if(count!==task.expected || count>9999) {await rpc('native-arm',{...data,count});return;}
      await stage('点击 Send to');
      const send=await waitFor(()=>control(/^Send to\b/i),'Send to');send.click();
      const citation=await waitFor(()=>control(/^Citation manager\b/i),'Citation manager');citation.click();
      await stage('选择 Citation manager → All results');
      const create=await waitFor(()=>control(/^Create file\b/i),'Citation manager 的 Create file');
      const scope=document.getElementById('citation-manager-menu') || create.closest('form') ||
        create.closest('[role="dialog"]') || create.parentElement.parentElement;
      let selected=false;
      const isAll=text=>/^All results(?:\s*\(|$)/i.test(normalize(text)) && !/on this page/i.test(text);
      for(const select of scope.querySelectorAll('select')) {
        if(!visible(select)) continue;
        const option=[...select.options].find(option=>isAll(option.textContent));
        if(option) {
          select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));
          select.dispatchEvent(new Event('change',{bubbles:true}));
          if(select.selectedOptions[0]===option) selected=true;
          break;
        }
      }
      if(!selected) {
        for(const input of scope.querySelectorAll('input[type="radio"]')) {
          const text=[...(input.labels || [])].map(el=>el.textContent).join(' ');
          if(isAll(text)) {input.click();selected=input.checked;break;}
        }
      }
      if(!selected && count!==1) throw new Error('无法确认 Citation manager 已选择 All results，已停止，避免只导出当前页。');
      // Re-read the count immediately before arming, then click the website's own control.
      const armed=await rpc('native-arm',{...data,count:countResults()});
      if(!armed?.ok) return;
      if(!visible(create) || create.disabled) throw new Error('Create file 控件不可用，请检查网页。');
      create.click();
    } catch(error) {await rpc('native-error',{...data,error:error.message});}
  }
  run().catch(()=>{});
})();
