# InGrid Index

<img src="https://ingrid-oss.eu/8.2.0/assets/components/ingrid-plattform.png" alt="InformationGrid illustration" width="480" align="right">

This repository is part of **[InGrid](https://ingrid-oss.eu)**, an open-source solution for building, managing, and exposing metadata-driven information systems.

**About InGrid Index:**
Modular YAML schemas for InGrid Index with pre-resolved JSON distributions and auto-generated HTML documentation.

## Repository Structure

```
src/                     ← Source of truth (editable YAML with $ref)
  index-dcat.yaml
  index-lvr.yaml
  index-umweltnavi.yaml
  parts/                 ← Shared schema fragments referenced via $ref
    core.yaml
    shared-types.yaml
    x-transform-sources.yaml ← Source formats of the mapping descriptions (no schema part)
dist/                    ← Local build output (gitignored, do not commit)
  <version>/
    schema/              ← Fully dereferenced JSON (no $ref, no x-transform)
      annotated/         ← Same, including the x-transform annotations
    *.html               ← Generated HTML documentation
scripts/
  build_schemas.js       ← Resolves schemas
  build_docs.py          ← Generates HTML docs
  x_transform.js         ← Checks the x-transform mapping descriptions
  x_transform_lib.js     ← Shared helpers for the above
  x-transform.schema.yaml ← Meta-schema for the check
.github/workflows/
  build.yml              ← CI: builds on tag push, publishes to "releases" branch
```

## Mapping descriptions (`x-transform`)

A field can carry `x-transform`: per source format a Markdown description of how
the field is read from a source record and written to one. The schema is the
documentation; the HTML docs show the descriptions under "Transformation".

```yaml
language:
  type: string
  x-transform:
    iso19139-2007: |
      # Lesen & schreiben

      `gmd:identificationInfo/*/gmd:language/gmd:LanguageCode/@codeListValue`

      ## Mapping (lookup)

      - `de` ↔ `ger` (lesen auch `deu`, `de`)
      - `en` ↔ `eng` (lesen auch `en`)

      > Lesen: ohne Angabe `de`.
```

- Use the YAML block style `|`. Headings start at `#`: `# Lesen & schreiben`
  (or `# Lesen` / `# Schreiben` if they differ), the full path as code,
  `## Mapping (lookup|logic)` as a list if values are not just copied, comments
  (`>`) for special cases ("Lesen: …", "Schreiben: …", "DCAT-AP 2.x: …").
  Fields without counterpart: "Kein Gegenstück in <format>." plus the origin.
- In mapping lists the index value is on the left: `↔` both directions,
  `←` only when reading, `→` only when writing.
- Source formats (title, path language, general rules, schemas, namespaces) are
  declared in [`src/parts/x-transform-sources.yaml`](src/parts/x-transform-sources.yaml).
  Their general rules are shown at the top of each schema page.
- A profile can override a description by repeating the field with only
  `x-transform`; such a field is dropped when publishing.
- The annotations are removed from the published schemas in
  `dist/<version>/schema/` (Ajv's strict mode rejects unknown keywords) and kept
  in `dist/<version>/schema/annotated/`.

```bash
npm run check   # validate the descriptions, print coverage per schema and source format
```

## Branches

- **`draft`** — the working branch. Every push rebuilds and publishes
  `releases:draft/`.
- **`releases`** — contains only generated output, one folder per version
  (e.g. `draft/`, `8.4.0/`, `8.5.0/`), plus a root `index.html` linking to
  each version's `index.html`. Consumers use this branch.
- **`version/<x.y.z>`** — support branches for patching an already-released
  version (created on demand).

### GitHub Pages

If `releases` is published via GitHub Pages with a custom domain, add a
`CNAME` file (containing the domain) to the root of the `releases` branch
manually. The build workflow only adds/updates `<version>/` folders and
`index.html`, so `CNAME` is left untouched on subsequent builds. If the
`releases` branch is ever recreated from scratch, re-add `CNAME` manually.

## How It Works

1. **Edit** schemas in `src/` on the `draft` branch. Use `$ref` freely to keep
   things modular.
2. **CI** runs automatically on every push to `draft`:
   - Resolves all `$ref` → `dist/draft/schema/*.json`
   - Generates HTML docs → `dist/draft/*.html`
   - Publishes both into the `releases` branch under `draft/`
3. **Release**: before tagging, rename the `[Unreleased]` section in
   [`changelog.md`](changelog.md) to `[<version>] - <date>` and add a fresh
   empty `[Unreleased]` section above it (see [Changelog](#changelog)).
   Commit that change, then tag the commit on `draft` as `v<version>` (e.g.
   `v8.4.0`) and push the tag:
   ```bash
   git checkout draft
   git tag v8.4.0 && git push origin v8.4.0
   ```
   This triggers the same build/publish steps using the version from the
   tag, producing `releases:8.4.0/` instead of `releases:draft/`.

### Work-in-progress schemas

A schema can be marked as work-in-progress by adding `x-wip: true` at the top of the YAML file:

```yaml
x-wip: true
$schema: https://json-schema.org/draft/2020-12/schema
title: ...
```

| `x-wip` | `draft` build | versioned release build |
|---|---|---|
| absent or `false` | included | included |
| `true` | included | **excluded** |

WIP schemas are always included in `draft` builds so they can be reviewed and developed against `releases:draft/`. They are silently skipped when building a versioned release.

> **Before tagging a release:** check that every schema that should be part of the release either has no `x-wip` field or has `x-wip: false`. Schemas with `x-wip: true` will not appear in the versioned output.

The `x-wip` field is stripped from the generated JSON schemas — it is build metadata only and does not appear in the output.

### Patching a released version

1. Create (or check out) `version/<x.y.z>` from the `v<x.y.z>` tag and commit
   the fix there.
2. Force-move the `v<x.y.z>` tag to the branch tip and push it:
   ```bash
   git tag -f v8.4.0
   git push origin v8.4.0 --force
   ```
3. CI rebuilds and overwrites the `8.4.0/` folder on the `releases` branch.

### Removing a published version

1. Delete the `v<x.y.z>` tag locally and on `origin`:
   ```bash
   git tag -d v8.4.0
   git push origin :refs/tags/v8.4.0
   ```
2. CI removes the `8.4.0/` folder from the `releases` branch and regenerates the root `index.html`.

## Changelog

[`changelog.md`](changelog.md) tracks notable changes to the schemas, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- While working on `draft`, add an entry under the **`[Unreleased]`** section
  in the same commit/PR as the schema change, under the matching subheading
  (`Added`, `Changed`, `Fixed`, `Removed`). Mention the affected schema file,
  e.g. `index-dcat.yaml: added sensor field`.
- When tagging a release, rename `[Unreleased]` to `[<x.y.z>] - <date>` (see
  step 3 in [How It Works](#how-it-works)).
- Skip entries for pure tooling/CI/doc changes that don't affect the schemas
  themselves.

## Local Development

Typical development flow:

1. Edit schemas in `src/` or shared fragments in `src/parts/`
2. Rebuild the generated JSON and HTML docs
3. Open `dist/draft/index.html` or serve `dist/draft/` locally to
   review the result

The build output is written to `dist/<version>/`, where `<version>` is
`"draft"` by default, or whatever `--version` is passed (see below). `dist/`
is gitignored — it's local build output, not committed.

```bash
# Install Node dependencies
npm install

# Create and activate a Python virtual environment
python -m venv .venv
source .venv/bin/activate

# Install Python dependencies for the docs build
pip install json-schema-for-humans pyyaml

# Check x-transform descriptions, build resolved schemas and HTML docs
npm run build

# Or run the steps separately
node scripts/x_transform.js check
node scripts/build_schemas.js
python scripts/build_docs.py

# Optionally build under a specific version (this is what CI does for releases)
node scripts/build_schemas.js --version 8.4.0
python scripts/build_docs.py --version 8.4.0
```

### Live rebuild while editing

To rebuild automatically whenever a YAML file changes:

```bash
# Rebuild schemas and docs when files under src/ change
npx nodemon --watch src --ext yaml --exec "npm run build"
```

To preview the generated docs locally with automatic browser reloads:

```bash
# Serve dist/draft/ and reload when generated HTML changes
npx browser-sync start --server dist/draft --files "dist/draft/*.html"
```

If you only need a simple local preview server without live reload:

```bash
python -m http.server 8000 --directory dist/draft
```

## Consuming as a Git Submodule

Add this repo as a submodule tracking the `releases` branch, which contains
only generated output (one folder per version):

```bash
git submodule add -b releases <repo-url> schemas
cd ..
git add schemas
git commit -m "Add ingrid-index schemas"
```

### Java

Point your JSON Schema validator at the resolved files for the version you need:

```
schemas/8.4.0/schema/index-dcat.json
schemas/8.4.0/schema/index-lvr.json
schemas/8.4.0/schema/index-umweltnavi.json
```

No `$ref` resolution required — these are fully self-contained.

### JavaScript / Node.js

```js
const schema = require('./schemas/8.4.0/schema/index-dcat.json');
// Use directly with ajv or any JSON Schema validator
```

### Updating the submodule to a new version

```bash
cd schemas
git pull origin releases
cd ..
git add schemas
git commit -m "Update ingrid-index schemas"
```

Then point your validator/imports at the new version's folder.

## Versioning

- The git tag is the source of truth for a release's version. There is no
  version field in `package.json`.
- A release is created by tagging `v<version>` and pushing the tag (see
  [How It Works](#how-it-works)). CI builds `dist/<version>/` using the
  version from the tag and publishes it to the `releases` branch under
  `<version>/`.
- The `$id` field of each schema is generated from `homepage` in
  `package.json` plus the build version, e.g.
  `https://schema.ingrid-oss.eu/index/8.4.0/schema/index-dcat.json`. This is
  an identifier only — it doesn't need to be a resolvable URL.
- `dist/` is generated locally and gitignored — only `src/` should be edited.
