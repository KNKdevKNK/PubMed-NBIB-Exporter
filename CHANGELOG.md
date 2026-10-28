# Changelog

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
