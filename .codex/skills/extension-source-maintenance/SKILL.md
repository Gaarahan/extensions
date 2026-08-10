---
name: extension-source-maintenance
description: Maintain the curated Keiyoushi/Mihon extensions repository. Use when adding, removing, blacklisting, restoring, or synchronizing a manga source and its APK, JAR, icons, HTML links, JSON/protobuf indexes, and sync manifests.
---

# Extension Source Maintenance

Use this skill only inside the `extensions` repository. Treat a source as the package name in `index.json`, never as a fuzzy display-name guess.

## Remove a source

Run `scripts/remove-sources.mjs --package <exact-package>` from the repository root after resolving each requested source. Repeat `--package` to remove multiple exact packages atomically. The script updates both JSON and protobuf indexes, the HTML listing, blacklist, local assets, and generated reports.

1. Resolve an exact, unique package from `index.json`. If the requested name is absent or ambiguous, report candidates and do not delete anything.
2. Remove the package from every published representation:
   - `index.json` (`extensionList.extensions`)
   - `index.pb`
   - `index.html` download/listing links
   - matching `apk/`, `jar/`, and local `icon/` assets
3. Add the package to `config/extension-blacklist.json`. This is required so the next upstream sync cannot restore it.
4. Remove the package from generated local reports, if present. Do not commit reports unless explicitly requested.
5. Regenerate or update the protobuf index. Never leave `index.json` and `index.pb` with different package sets.
6. Run `scripts/verify-curated-repo.mjs --package <exact-package>` before committing. It checks the JSON manifest, APK/JAR coverage, and the absence of the just-removed package's assets and HTML link. Also independently verify the protobuf package set matches JSON.

Do not remove similarly named sources. For example, a request for `Hentai3` does not authorize changes to `Hentai3z.CC`.

## Synchronize upstream

Start from the upstream release repository, then apply `config/extension-blacklist.json` to every published index and asset directory. Preserve repository-local `config/` and the skill itself. Do not copy upstream files over the maintenance tooling.

After a sync, ensure the following invariant holds for every published package:

- exactly one JSON entry;
- one protobuf entry;
- an existing APK and JAR named by that entry;
- no blacklisted package in any published index, HTML listing, or asset directory.

## Commit policy

Commit source removals, blacklist updates, index changes, and asset deletions together. Leave generated reports untracked unless the user explicitly asks for them.

## Resource

Run `scripts/verify-curated-repo.mjs --package <exact-package>` from the repository root after every source removal. Omit `--package` only for a general JSON and asset coverage check.
