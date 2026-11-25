# Changelog

## 2.0.3 (2026-11-25)

- Stop treating every missing or non-identical result-page input as a CAPTCHA/HTTP 414 error.
- Wait for native result and export controls, and inspect full-query metadata in addition to search inputs and URL terms.
- Bind opaque longquery results to confirmed native form readback, the first observed navigation and matching counts; use complete native GET/POST query evidence when available. Do not authorize unrelated results by count alone.
- Distinguish actual verification pages, detected HTTP 414, loading and unavailable query provenance in diagnostics.
- Keep existing completed downloads while making older in-flight verification states retryable.
- Add nine offline regressions covering metadata, opaque/missing inputs, unrelated navigation, native request bodies and loading. All 32 offline checks pass; live PubMed integration is not independently verified for this patch.

## 2.0.2 (2026-11-25)

- Fix false search-input write failures for pasted multiline queries. Single-line HTML input sanitization removes CR/LF; normalize pasted line/tab separators to spaces before assignment.
- Share normalization between count planning, content-script entry, and background result verification. Preserve operators, quotes, field tags, and interior phrase spaces.
- Choose the visible editable search field and use the native DOM value setter when page code wraps the value property.
- Continue to block actual truncation, altered operators, and changes immediately before submission.
- Add five regression checks covering multiline CRLF input, textareas, hidden fields, page-wrapped setters, and true truncation. All 23 offline checks pass.

## 2.0.1

- Submit complete queries through PubMed's native search form instead of constructing oversized GET URLs.
- Verify the displayed full query and support PubMed-generated longquery result URLs and download referrers.
- Make pending navigation states from 2.0.0 retryable after upgrading.
- Add four long-query and upgrade checks; 18 offline checks pass.
- User feedback reports successful operation; independent live browser/EndNote and large-scale validation remain outstanding.

## 2.0.0

- Introduce native Send to → Citation manager → All results → Create file export.
- Automatically split date ranges and over-limit single-day PMID ranges.
- Track native downloads, name files by range, and checkpoint task progress.
- Preserve original NBIB contents; cross-range duplicates are left for the reference manager.

Earlier 1.x versions used API-fetched citation content and are not included in this native-export repository.
