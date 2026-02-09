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
dist/                    ← Generated (do not edit)
  resolved/              ← Fully dereferenced JSON (no $ref) — use these
  bundled/               ← Bundled JSON (internal $ref only)
docs/                    ← Generated HTML documentation
scripts/
  build_schemas.js       ← Resolves and bundles schemas
  build_docs.py          ← Generates HTML docs
.github/workflows/
  build.yml              ← CI: builds on tag push, commits artifacts back
```

## How It Works

1. **Edit** schemas in `src/`. Use `$ref` freely to keep things modular.
2. **Tag** a release: `git tag v1.2.0 && git push origin v1.2.0`
3. **CI** runs automatically:
   - Resolves all `$ref` → `dist/resolved/*.json`
   - Bundles schemas → `dist/bundled/*.json`
   - Generates HTML docs → `docs/*.html`
   - Commits artifacts and updates the tag

The tag is the versioned snapshot. Consumers always get pre-built output.

## Local Development

```bash
# Install Node dependencies
npm install

# Build resolved & bundled schemas
node scripts/build_schemas.js

# Optionally inject a version into $id
node scripts/build_schemas.js --version v1.2.0

# Build HTML documentation
pip install json-schema-for-humans pyyaml
python scripts/build_docs.py
```

## Consuming as a Git Submodule

Add this repo as a submodule pinned to a specific tag:

```bash
git submodule add <repo-url> schemas
cd schemas
git checkout v1.2.0
cd ..
git add schemas
git commit -m "Add ingrid-index schemas v1.2.0"
```

### Java

Point your JSON Schema validator at the resolved files:

```
schemas/dist/resolved/index-dcat.json
schemas/dist/resolved/index-lvr.json
schemas/dist/resolved/index-umweltnavi.json
```

No `$ref` resolution required — these are fully self-contained.

### JavaScript / Node.js

```js
const schema = require('./schemas/dist/resolved/index-dcat.json');
// Use directly with ajv or any JSON Schema validator
```

### Updating the submodule to a new version

```bash
cd schemas
git fetch --tags
git checkout v1.3.0
cd ..
git add schemas
git commit -m "Update ingrid-index schemas to v1.3.0"
```

## Versioning

- Git tags (`v1.0.0`, `v1.1.0`, ...) are the version identifiers
- The `$id` field in each schema reflects the version when built by CI
- `dist/` and `docs/` are generated — only `src/` should be edited
