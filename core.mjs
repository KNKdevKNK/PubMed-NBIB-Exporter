export const LIMIT = 9999;
export const DAY = 86400000;
export function dateNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请输入完整日期。');
  const n = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(n) || dateString(n) !== value) throw new Error('日期无效。');
  return n;
}
export const dateString = n => new Date(n).toISOString().slice(0, 10);
export const dateClause = (start, end, field) => `("${start.replaceAll('-', '/')}"[${field}] : "${end.replaceAll('-', '/')}"[${field}])`;
export function validate(config) {
  if (!config.term.trim()) throw new Error('请填写 PubMed 检索式。');
  if (/#\d+/.test(config.term)) throw new Error('请将 #1 等历史检索编号展开为完整检索式，接口不共享网页检索历史。');
  if (dateNumber(config.start) > dateNumber(config.end)) throw new Error('开始日期不能晚于结束日期。');
  if (!['dp', 'edat', 'crdt'].includes(config.field)) throw new Error('日期字段无效。');
  if (!Number.isInteger(config.limit) || config.limit < 100 || config.limit > LIMIT) throw new Error('每文件上限应为 100 至 9999。');
}
export function rootTerm(config) { return `(${config.term.trim()}) AND ${dateClause(config.start, config.end, config.field)}`; }
export function nodeTerm(config, node) {
  let term = `(${rootTerm(config)}) AND ${dateClause(node.start, node.end, config.field)}`;
  if (node.lo !== undefined) term += ` AND ${node.lo}:${node.hi}[uid]`;
  return term;
}
export function split(node) {
  if (node.lo !== undefined) {
    if (node.lo >= node.hi) throw new Error('无法继续拆分 PMID 范围，请保留日志。');
    const mid = Math.floor((node.lo + node.hi) / 2);
    return [{...node, hi: mid}, {...node, lo: mid + 1}];
  }
  const start = dateNumber(node.start), end = dateNumber(node.end);
  if (start === end) return [{...node, lo: 1, hi: 999999999999}];
  const mid = start + Math.floor((end - start) / DAY / 2) * DAY;
  return [{start: node.start, end: dateString(mid)}, {start: dateString(mid + DAY), end: node.end}];
}
