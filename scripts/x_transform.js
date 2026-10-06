// Checks the x-transform mapping descriptions (see README.md, "Mapping descriptions").
//
//   node scripts/x_transform.js check [--root <dir>]
//     Validates all descriptions and the declaration of the source formats,
//     checks that the published (stripped) schemas still compile with Ajv in
//     strict mode, and prints the coverage per schema and source format.
//     Exit code 1 on errors.

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020").default;
const lib = require("./x_transform_lib");

const META_ID = "urn:ingrid-index:x-transform";

function parseArgs(argv) {
  const args = { command: argv[0], root: path.resolve(__dirname, "..") };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

// Ajv2020 in strict mode, as consumers of the published schemas use it. Formats
// are not part of these checks, and the strict mode type warnings of the
// existing schemas are only logged by Ajv, so they are silenced here.
function createAjv(options = {}) {
  return new Ajv2020({ allErrors: true, validateFormats: false, logger: false, ...options });
}

function formatAjvErrors(errors) {
  return (errors || []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

// ── Checks ──────────────────────────────────────────────────────────────────

function checkAnnotations(repo, errors, warnings) {
  const ajv = createAjv();
  ajv.addSchema(repo.load(path.join(__dirname, "x-transform.schema.yaml")));
  const validateTransform = ajv.getSchema(`${META_ID}#/$defs/xTransform`);
  const validateSources = ajv.getSchema(`${META_ID}#/$defs/xTransformSources`);

  // Source declaration.
  if (!fs.existsSync(repo.sourcesFile())) {
    errors.push(`${lib.SOURCES_FILE} is missing`);
  } else if (!validateSources(repo.sources())) {
    errors.push(`${lib.SOURCES_FILE}: ${formatAjvErrors(validateSources.errors)}`);
  }
  const sources = repo.sources();
  const schemaNames = repo.schemaFiles().map((f) => path.basename(f, ".yaml"));
  for (const [source, decl] of Object.entries(sources)) {
    for (const name of (decl && decl.schemas) || []) {
      if (!schemaNames.includes(name)) {
        errors.push(`${lib.SOURCES_FILE}: ${source}/schemas: unknown index schema "${name}"`);
      }
    }
  }

  // Descriptions.
  for (const file of repo.sourceFiles()) {
    for (const occ of repo.findKeyword(file, lib.ANNOTATION)) {
      const where = `${repo.rel(file)}#${occ.pointer}`;
      if (!validateTransform(occ.value)) {
        errors.push(`${where}: ${formatAjvErrors(validateTransform.errors)}`);
        continue;
      }
      for (const [source, text] of Object.entries(occ.value)) {
        if (!sources[source]) {
          errors.push(`${where}: source "${source}" is not declared in ${lib.SOURCES_FILE}`);
          continue;
        }
        // prefixes in code spans (paths) must be declared for the source format
        const declared = Object.keys(sources[source].namespaces || {});
        const undeclared = new Set();
        for (const span of lib.codeSpans(text)) {
          lib.pathPrefixes(span).filter((p) => !declared.includes(p)).forEach((p) => undeclared.add(p));
        }
        if (undeclared.size) {
          warnings.push(`${where}/${source}: namespace prefix(es) not declared for ${source}: ${[...undeclared].join(", ")}`);
        }
      }
    }
  }
}

// Descriptions that no index schema reaches (e.g. in an unused $def), or only
// schemas the source format is not documented for (`schemas` in src/parts/x-transform-sources.yaml).
function checkOrphans(repo, trees, warnings) {
  for (const file of repo.sourceFiles()) {
    for (const occ of repo.findKeyword(file, lib.ANNOTATION)) {
      const key = `${path.resolve(file)}#${occ.pointer}`;
      const reachedBy = trees.filter((t) => t.attached.has(key)).map((t) => schemaName(t));
      if (reachedBy.length === 0) {
        warnings.push(`${repo.rel(file)}#${occ.pointer}: description is not reached by any index schema`);
        continue;
      }
      for (const source of Object.keys(occ.value || {})) {
        if (!reachedBy.some((name) => repo.appliesTo(source, name))) {
          warnings.push(
            `${repo.rel(file)}#${occ.pointer}/${source}: only reached by ${reachedBy.join(", ")}, ` +
              `which ${source}/schemas in ${lib.SOURCES_FILE} does not list`
          );
        }
      }
    }
  }
}

// The published schemas (annotations stripped) must compile with Ajv in strict mode.
async function checkPublishedSchemas(repo, errors) {
  for (const file of repo.schemaFiles()) {
    const baseName = path.basename(file, ".yaml");
    try {
      const { published } = await lib.resolveSchema(file, `check:${baseName}`, `check:annotated:${baseName}`);
      createAjv().compile(JSON.parse(published));
    } catch (e) {
      errors.push(`${repo.rel(file)}: published schema does not compile with Ajv (strict): ${e.message}`);
    }
  }
}

// ── Reports ─────────────────────────────────────────────────────────────────

function schemaName(tree) {
  return path.basename(tree.schemaFile, ".yaml");
}

function coverageMatrix(repo, trees) {
  const sources = Object.keys(repo.sources());
  return trees.map((tree) => ({
    tree,
    name: schemaName(tree),
    // null: the source format is not documented for this schema
    coverage: Object.fromEntries(
      sources.map((s) => [s, repo.appliesTo(s, schemaName(tree)) ? lib.coverage(tree, s) : null])
    ),
  }));
}

function percent(c) {
  return c.total ? Math.round((100 * c.covered) / c.total) : 0;
}

function formatCoverage(c) {
  return c ? `${c.covered} / ${c.total} (${percent(c)} %)` : "–";
}

function printCoverage(repo, matrix) {
  const sources = Object.keys(repo.sources());
  const rows = [["Schema", ...sources]];
  for (const row of matrix) {
    rows.push([row.name, ...sources.map((s) => formatCoverage(row.coverage[s]))]);
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  console.log("\nCoverage (leaf fields with a description):");
  for (const r of rows) console.log("  " + r.map((c, i) => c.padEnd(widths[i])).join("  "));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = new lib.Repo(args.root);
  const errors = [];
  const warnings = [];

  if (args.command !== "check") {
    throw new Error("Usage: node scripts/x_transform.js check [--root <dir>]");
  }
  checkAnnotations(repo, errors, warnings);
  const trees = repo.schemaFiles().map((f) => repo.buildFieldTree(f));
  checkOrphans(repo, trees, warnings);
  await checkPublishedSchemas(repo, errors);
  printCoverage(repo, coverageMatrix(repo, trees));

  warnings.forEach((w) => console.warn(`WARN  ${w}`));
  errors.forEach((e) => console.error(`ERROR ${e}`));
  if (errors.length) {
    console.error(`\n${errors.length} error(s).`);
    process.exit(1);
  }
  console.log("\nOK.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
