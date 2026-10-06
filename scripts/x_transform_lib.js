// Shared helpers for the x-transform mapping descriptions (see README.md):
// loading the YAML sources, walking an index schema into a list of fields,
// resolving the effective annotation per field and source format (profile
// overrides) and coverage.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const $RefParser = require("@apidevtools/json-schema-ref-parser");

const ANNOTATION = "x-transform";
const ANNOTATION_KEYS = new Set([ANNOTATION]);
// Declaration of the source formats.
const SOURCES_FILE = "src/parts/x-transform-sources.yaml";

// Keywords whose values map names to subschemas (the keys are names, not keywords).
const NAME_MAP_KEYS = new Set(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]);
// Keywords whose values are instance data, never subschemas.
const DATA_KEYS = new Set(["examples", "enum", "const", "default"]);

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function escapePointer(token) {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapePointer(token) {
  return decodeURIComponent(token).replace(/~1/g, "/").replace(/~0/g, "~");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Whether a schema consists of annotations only (no validation keywords).
function onlyAnnotations(node) {
  return isObject(node) && Object.keys(node).length > 0 && Object.keys(node).every((k) => ANNOTATION_KEYS.has(k));
}

// Removes x-transform from a (dereferenced) schema in place.
function stripAnnotations(node, isNameMap = false, seen = new Set()) {
  if (node === null || typeof node !== "object" || seen.has(node)) return node;
  seen.add(node);
  if (Array.isArray(node)) {
    node.forEach((item) => stripAnnotations(item, false, seen));
    return node;
  }
  for (const key of Object.keys(node)) {
    if (!isNameMap && ANNOTATION_KEYS.has(key)) {
      delete node[key];
    } else if (isNameMap || !DATA_KEYS.has(key)) {
      const child = node[key];
      const onlyAnnotation = isNameMap && onlyAnnotations(child);
      stripAnnotations(child, !isNameMap && NAME_MAP_KEYS.has(key), seen);
      // a profile repeats a field only for its x-transform (see README.md);
      // without the annotation it is an empty schema and is dropped
      if (onlyAnnotation) delete node[key];
    }
  }
  return node;
}

// Sets $id right after "title" so it's visible near the top of the file.
function setId(schema, id) {
  const ordered = {};
  for (const [key, value] of Object.entries(schema)) {
    ordered[key] = value;
    if (key === "title") {
      ordered.$id = id;
    }
  }
  if (!("$id" in ordered)) {
    ordered.$id = id;
  }
  return ordered;
}

// Resolves a top-level schema as it is published: all $ref dereferenced,
// x-wip removed, $id set. Returns the JSON text of the annotated variant and of
// the published variant (annotations stripped).
async function resolveSchema(file, id, annotatedId) {
  const resolved = await $RefParser.dereference(file);
  delete resolved["x-wip"];
  const annotated = JSON.stringify(setId(resolved, annotatedId), null, 2);
  const published = JSON.stringify(setId(stripAnnotations(JSON.parse(JSON.stringify(resolved))), id), null, 2);
  return { annotated, published };
}

// ── Code in the descriptions ─────────────────────────────────────────────────

// Contents of all code spans (`…`) of a description.
function codeSpans(md) {
  return [...md.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

// Namespace prefixes used in a code span (`prefix:local`), ignoring string
// literals and <IRI>s. XPath axes (`self::`) and URLs (`http://`) do not match.
function pathPrefixes(p) {
  const stripped = p.replace(/'[^']*'|"[^"]*"|<[^>]*>|\b[a-z]+:\/\/\S*/g, "");
  const prefixes = new Set();
  for (const m of stripped.matchAll(/(?<![\w/#.-])([a-zA-Z][\w-]*):[A-Za-z_]/g)) {
    prefixes.add(m[1]);
  }
  return [...prefixes];
}

class Repo {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
    this.srcDir = path.join(this.rootDir, "src");
    this.partsDir = path.join(this.srcDir, "parts");
    this.cache = new Map();
  }

  rel(file) {
    return toPosix(path.relative(this.rootDir, file));
  }

  load(file) {
    const abs = path.resolve(file);
    if (!this.cache.has(abs)) {
      this.cache.set(abs, yaml.load(fs.readFileSync(abs, "utf8")));
    }
    return this.cache.get(abs);
  }

  // Top-level index schemas (src/*.yaml), as discovered by the build.
  schemaFiles() {
    return fs
      .readdirSync(this.srcDir)
      .filter((f) => f.endsWith(".yaml") && fs.statSync(path.join(this.srcDir, f)).isFile())
      .sort()
      .map((f) => path.join(this.srcDir, f));
  }

  // All schema sources, including the shared parts.
  sourceFiles() {
    const walk = (dir) =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((e) => {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) return walk(p);
          return e.name.endsWith(".yaml") ? [p] : [];
        });
    return walk(this.srcDir);
  }

  isProfileFile(file) {
    return !path.resolve(file).startsWith(this.partsDir + path.sep);
  }

  resolveRef(ref, file) {
    const [filePart, fragment = ""] = ref.split("#");
    const target = filePart ? path.resolve(path.dirname(file), filePart) : path.resolve(file);
    let node = this.load(target);
    const tokens = fragment ? fragment.split("/").slice(1).map(unescapePointer) : [];
    for (const token of tokens) {
      if (node === null || typeof node !== "object" || !(token in node)) {
        throw new Error(`Cannot resolve $ref "${ref}" in ${this.rel(file)}`);
      }
      node = node[token];
    }
    return { file: target, pointer: fragment, node };
  }

  // Every occurrence of `key` (x-transform) in a source file: [{ file, pointer, value }].
  findKeyword(file, key) {
    const found = [];
    const visit = (node, pointer, isNameMap) => {
      if (Array.isArray(node)) {
        node.forEach((item, i) => visit(item, `${pointer}/${i}`, false));
        return;
      }
      if (!isObject(node)) return;
      if (!isNameMap && key in node) found.push({ file, pointer, value: node[key] });
      for (const [k, v] of Object.entries(node)) {
        if (!isNameMap && (ANNOTATION_KEYS.has(k) || DATA_KEYS.has(k))) continue;
        visit(v, `${pointer}/${escapePointer(k)}`, !isNameMap && NAME_MAP_KEYS.has(k));
      }
    };
    visit(this.load(file), "", false);
    return found;
  }

  // The declared source formats (src/parts/x-transform-sources.yaml).
  sourcesFile() {
    return path.join(this.rootDir, SOURCES_FILE);
  }

  sources() {
    return fs.existsSync(this.sourcesFile()) ? this.load(this.sourcesFile()) || {} : {};
  }

  // Whether a source format is documented for an index schema (`schemas` in
  // src/parts/x-transform-sources.yaml; without it, for all schemas).
  appliesTo(source, schemaName) {
    const schemas = (this.sources()[source] || {}).schemas;
    return !Array.isArray(schemas) || schemas.includes(schemaName);
  }

  // Walks an index schema and returns its fields in schema order:
  // Map<fieldPath, { path, parent, children: string[], annotations: [{ value, file, pointer, profile }] }>.
  // Field paths use `.` between properties and `[]` for array items,
  // e.g. `temporal.data_temporal[].date_range.gte`.
  buildFieldTree(schemaFile) {
    const fields = new Map();
    const attached = new Set();

    const ensureField = (fieldPath, parent) => {
      if (!fields.has(fieldPath)) {
        fields.set(fieldPath, { path: fieldPath, parent, children: [], annotations: [] });
        if (parent !== null) fields.get(parent).children.push(fieldPath);
      }
      return fields.get(fieldPath);
    };

    const visit = (node, file, pointer, fieldPath, childPrefix, stack) => {
      if (!isObject(node)) return;
      const key = `${file}#${pointer}`;
      if (stack.has(key)) return;
      stack = new Set(stack).add(key);

      if (fieldPath !== null && isObject(node[ANNOTATION])) {
        const field = fields.get(fieldPath);
        if (!field.annotations.some((a) => a.file === file && a.pointer === pointer)) {
          field.annotations.push({ value: node[ANNOTATION], file, pointer, profile: this.isProfileFile(file) });
        }
        attached.add(key);
      }
      if (typeof node.$ref === "string") {
        const target = this.resolveRef(node.$ref, file);
        visit(target.node, target.file, target.pointer, fieldPath, childPrefix, stack);
      }
      (node.allOf || []).forEach((sub, i) => visit(sub, file, `${pointer}/allOf/${i}`, fieldPath, childPrefix, stack));
      for (const k of ["then", "else"]) {
        visit(node[k], file, `${pointer}/${k}`, fieldPath, childPrefix, stack);
      }
      if (isObject(node.properties)) {
        for (const [name, sub] of Object.entries(node.properties)) {
          const childPath = childPrefix ? `${childPrefix}.${name}` : name;
          ensureField(childPath, fieldPath);
          visit(sub, file, `${pointer}/properties/${escapePointer(name)}`, childPath, childPath, stack);
        }
      }
      if (isObject(node.items)) {
        visit(node.items, file, `${pointer}/items`, fieldPath, `${childPrefix}[]`, stack);
      }
    };

    visit(this.load(schemaFile), path.resolve(schemaFile), "", null, "", new Set());
    return { schemaFile, fields, attached };
  }
}

// The description that applies to a field for one source format: profile
// files win over the shared parts (src/parts/), otherwise the last one in
// schema order.
function effectiveAnnotation(field, source) {
  let best = null;
  let count = 0;
  for (const a of field.annotations) {
    if (!isObject(a.value) || typeof a.value[source] !== "string") continue;
    count++;
    if (!best || a.profile >= best.profile) best = a;
  }
  if (!best) return null;
  return { text: best.value[source], file: best.file, pointer: best.pointer, overridden: count > 1 };
}

function ancestors(tree, field) {
  const result = [];
  let parent = field.parent;
  while (parent !== null) {
    const p = tree.fields.get(parent);
    result.push(p);
    parent = p.parent;
  }
  return result;
}

function hasAnnotatedDescendant(tree, field, source) {
  return field.children.some((c) => {
    const child = tree.fields.get(c);
    return effectiveAnnotation(child, source) || hasAnnotatedDescendant(tree, child, source);
  });
}

// A leaf is covered if it is described itself, or if an ancestor is described
// and no field below that ancestor is (the ancestor's description then covers
// the whole object, e.g. a KeyValue).
function isCovered(tree, field, source) {
  if (effectiveAnnotation(field, source)) return true;
  for (const anc of ancestors(tree, field)) {
    if (effectiveAnnotation(anc, source)) return !hasAnnotatedDescendant(tree, anc, source);
  }
  return false;
}

function coverage(tree, source) {
  const leaves = [...tree.fields.values()].filter((f) => f.children.length === 0);
  const missing = leaves.filter((f) => !isCovered(tree, f, source)).map((f) => f.path);
  const annotated = [...tree.fields.values()].filter((f) => effectiveAnnotation(f, source)).length;
  return { total: leaves.length, covered: leaves.length - missing.length, missing, annotated };
}

module.exports = {
  ANNOTATION,
  SOURCES_FILE,
  Repo,
  stripAnnotations,
  resolveSchema,
  codeSpans,
  pathPrefixes,
  effectiveAnnotation,
  coverage,
};
