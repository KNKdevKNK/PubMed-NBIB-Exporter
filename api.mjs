import {LIMIT} from './core.mjs';
const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
export class PubMedAPI {
  constructor({check = () => {}, progress = () => {}, fetcher = globalThis.fetch.bind(globalThis)} = {}) {
    this.check = check; this.progress = progress; this.fetcher = fetcher; this.last = 0;
  }
  async request(endpoint, params, json) {
    for (let attempt = 0; attempt < 5; attempt++) {
      this.check();
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 400 - (Date.now() - this.last))));
      this.check(); this.last = Date.now();
      try {
        const response = await this.fetcher(BASE + endpoint + '.fcgi', {
          method: 'POST', body: new URLSearchParams({db: 'pubmed', tool: 'PubMedNBIBExporter', ...params}),
          signal: AbortSignal.timeout(90000), credentials: 'omit'
        });
        if (!response.ok) {
          const error = new Error(`NCBI HTTP ${response.status}`);
          error.retryable = response.status === 429 || response.status >= 500;
          error.retryAfter = Math.min(120000, Math.max(0, Number(response.headers.get('Retry-After')) * 1000 || 0));
          throw error;
        }
        const text = await response.text();
        return json ? JSON.parse(text) : text;
      } catch (error) {
        this.check();
        if (error.retryable === false || attempt === 4) throw error;
        this.progress(`网络暂不可用，正在重试 (${attempt + 1}/4)…`);
        let remaining = Math.max(error.retryAfter || 0, 2000 * 2 ** attempt);
        while (remaining > 0) {
          this.check(); await new Promise(resolve => setTimeout(resolve, Math.min(500, remaining))); remaining -= 500;
        }
      }
    }
  }
  async search(term, retmax) {
    const data = await this.request('esearch', {term, retmode: 'json', retmax: String(Math.min(retmax, LIMIT))}, true);
    const result = data.esearchresult;
    const errors = result?.errorlist;
    if (data.error || !result || (errors && Object.values(errors).some(v => v?.length))) {
      throw new Error('PubMed 检索错误：' + JSON.stringify(data.error || errors || data));
    }
    const count = Number(result.count);
    if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(result.idlist)) throw new Error('PubMed 响应格式异常。');
    // PhraseNotFound can be a normal part of automatic term mapping; preserve it for audit.
    this.lastTranslation = result.querytranslation;
    this.lastWarnings = Object.fromEntries(Object.entries(result.warninglist || {})
      .filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value)));
    return {count, ids: result.idlist};
  }
}
