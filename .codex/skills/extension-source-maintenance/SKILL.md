---
name: extension-source-maintenance
description: Maintain the curated Keiyoushi/Mihon repository while permanently excluding previously removed extensions from upstream syncs.
---

# Extension Source Maintenance

Use only inside the extensions repository. Identify each source by its exact index.json packageName. Never guess from a similar display name or final slug.

## Never restore previous removals

The owner requires previously deleted extensions to stay deleted during every upstream sync. Keep config/extension-blacklist.json and all repository-local maintenance tooling. Do not overwrite them with upstream files. Only an explicit owner request to restore a particular exact package can reverse its exclusion.

Before syncing, audit prior fork deletion commits against the blacklist. Compare package sets before and after each relevant maintenance commit, distinguishing intentional fork removals from upstream removals or renames. Add confirmed missing exclusions before applying upstream changes. If intent or package identity is ambiguous, ask rather than guessing. Do not remove similarly named sources: Hentai3 and Hentai3z.CC are different packages.

## Language retention policy

The owner wants all-language, English, Simplified Chinese and Traditional Chinese packages. Apply `config/language-policy.json` during every cleanup and upstream sync. Match the source language metadata, not a guessed package-name prefix. Keep a whole package if any source is `all`, `en` or `zh`, including hyphenated English/Chinese variants such as `zh-Hans`, `zh-Hant`, `zh-CN`, `zh-TW` and `zh-HK`. Other sources bundled inside a retained multilingual package remain unchanged; deleting metadata would not remove those languages from its APK/JAR.

Explicit exclusions always win, including Hentai Image and Doujiva even though they are tagged `all`. Never restore any blacklist package. Add removed packages to the blacklist so future upstream updates cannot restore them. Newly encountered packages without any allowed source language must also be excluded.

After staging upstream files and applying the existing blacklist, run:

    node .codex/skills/extension-source-maintenance/scripts/clean-languages.mjs --dry-run
    node .codex/skills/extension-source-maintenance/scripts/clean-languages.mjs

This executable cleanup identifies exact packages from their source metadata and calls the verified removal tool in one batch, updating the indexes, assets and blacklist together. No further clarification of this language rule is needed during a requested future cleanup or upstream sync. This rule does not authorize an unrequested sync or unrelated changes. Its preflight permits otherwise consistent packages pending language cleanup, but its final validation enforces the policy. Do not publish unless the general verifier passes. Preserve `config/language-policy.json` and these checks during every sync.

## Synchronize upstream

Pin the upstream revision. Apply the entire blacklist to JSON, protobuf, HTML, release-assets.json, and any local APK/JAR/icon assets. Preserve fork-specific repo.json index_v2 and README URLs, config, and maintenance tooling. Use a normal commit based on the current fork head; do not force-reset history.

Current upstream publishes APK/JAR files through GitHub Releases rather than local directories. Preserve exact upstream release URLs and package hashes; do not rewrite them to nonexistent fork releases. Remove obsolete local binary directories in the same sync commit. Preserve the upstream index.min.json outdated-client notice; it is not the real package list.

Required invariants:
- Exactly one JSON and protobuf entry per published package, with matching versions and APK/icon/JAR resource URLs.
- Exactly one HTML APK link per published package, matching its exact URL.
- No excluded package in indexes, HTML downloads, release manifest, or local assets.
- If local APK/JAR directories exist, every indexed binary exists there. Otherwise, release URLs have the expected upstream shape and each package has a manifest hash.
- Release manifest package keys equal the published package set.

Run the verifier and `node --test .codex/skills/extension-source-maintenance/scripts/language-policy.test.mjs`, then separately verify remote release assets exist and are uploaded. Manifest validation does not prove download availability or downloaded-byte integrity. Record the pinned revision and verification scope. Check the final remote commit after publication.

## Resolve a name or keyword

The owner will usually provide an extension name or keyword rather than a package ID. Search index.json extension names, source names, package names and source home URLs for that term; show the exact matching names and package IDs when clarification is needed. Treat keywords only as a discovery step, never as a deletion glob. If the intended extension resolves uniquely, remove that exact package and all its necessary index and local files. If several packages could match, ask which to remove unless the owner clearly requested all matches. A package can contain multiple sources: explain that removing it removes those bundled sources when this could change the requested scope. If absent, report that it is already absent rather than deleting a similarly named package. Do not make additional deletions merely because this skill was updated.

## Remove a source

From the repository root run:

    node .codex/skills/extension-source-maintenance/scripts/remove-sources.mjs --package <exact-package>

Repeat --package for multiple exact packages. Resolve exactly one entry for each requested name first; absent or ambiguous names require clarification. The tool preflights the existing repository and all replacements before writing, updates JSON/protobuf/HTML, blacklist and release manifest, removes matching local files, and scrubs local reports. Staged writes include rollback for ordinary filesystem errors; a process crash is not a multi-file atomic transaction.

Run:

    node .codex/skills/extension-source-maintenance/scripts/verify-curated-repo.mjs --package <exact-package>

Omit --package for general verification. Both tools accept --root <directory>. Test source removal in a disposable copy after tooling changes, including nonexistent/duplicate packages and malformed input; failures must leave tracked files unchanged. Commit removals, blacklist, indexes, assets and relevant tooling together. Do not commit generated reports unless explicitly requested.
