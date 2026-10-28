# PubMed NBIB Exporter

A Chrome / Edge Manifest V3 extension that splits large PubMed searches into manageable date ranges and downloads **native NBIB files** through **Send to → Citation manager → All results → Create file**.

[中文说明](README.md) · [Download v2.0.1](dist/PubMed-NBIB-Native-v2.0.1.zip)

## Install

Download and extract the ZIP. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the folder containing `manifest.json`. No server, API key, build step, or Node.js installation is required to use the extension. The UI is in Chinese.

## How it works

1. Enter a complete PubMed query and inclusive date range.
2. ESearch counts results; ranges above the configurable limit (default: 9,999) are split by date, then by PMID if a single day still exceeds the limit.
3. The extension enters the complete query into PubMed's own search form. PubMed handles long queries and its own short `longquery` URLs.
4. It operates Citation manager, selects All results, and clicks Create file.
5. PubMed generates the original NBIB. The extension names the download by date range and verifies browser download completion, a non-empty file, and the `.nbib` extension.

No EFetch is used and no citation content is generated, merged, or rewritten. Keep the tool and dedicated PubMed tabs open. Handle verification pages manually and retry from the tool.

## EndNote

Open the NBIB file in EndNote or use **File → Import → File → PubMed (NLM)**. Because publication dates can overlap across electronic and print dates, the original files may contain duplicates between ranges. Deduplicate after importing.

## Limitations and privacy

Version 2.0.1 has been reported working by a user and passes 18 offline checks. Maintainer-controlled live browser/EndNote integration and 100,000-record scale runs have not been independently verified. Test a small range first.

Counts are taken before export; the extension does not read NBIB bodies to validate individual records. PubMed may change during a task. Website changes, browser policies, verification pages, and other download extensions may interrupt automation.

Queries are sent only to NCBI for the requested functionality. Task progress stays in the browser's extension storage. There is no telemetry or third-party relay. Audit files can include search terms and local download paths; review them before sharing.

## Develop

Node.js 20+ is required for offline checks only. Python 3 is used to package the extension.

```sh
npm test
npm run check
python scripts/package.py
```

No third-party runtime dependencies. See [the Chinese user guide](使用说明.md), [CHANGELOG](CHANGELOG.md). No open-source license has been selected for this publication.

This is an independent community project, not affiliated with NCBI, NLM, NIH, Clarivate, or EndNote.
