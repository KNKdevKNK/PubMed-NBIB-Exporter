// Shared by the content script, count planner, and background verifier.
// Single-line input elements remove CR/LF rather than preserving word boundaries.
// Convert pasted line/tab separators to spaces BEFORE assigning the DOM value.
// Keep operators, quotes, punctuation, case, and existing interior spaces intact.
(() => {
  function normalizeTerm(value) {
    return String(value ?? '').replace(/[\t\r\n]+/g,' ').trim();
  }
  globalThis.PubMedNBIBSearch = Object.freeze({normalizeTerm});
})();
