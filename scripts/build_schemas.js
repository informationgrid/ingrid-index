const fs = require("fs");
const path = require("path");
const $RefParser = require("@apidevtools/json-schema-ref-parser");

const SRC_DIR = path.resolve(__dirname, "..", "src");
const RESOLVED_DIR = path.resolve(__dirname, "..", "dist", "resolved");
const BUNDLED_DIR = path.resolve(__dirname, "..", "dist", "bundled");

// Optional: --version v1.2.0  →  patches $id URLs with the version string
const versionFlag = process.argv.indexOf("--version");
const version =
  versionFlag !== -1 ? process.argv[versionFlag + 1] : undefined;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Discover main schema files (top-level *.yaml in src/, ignore subdirs)
function discoverSchemas() {
  return fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".yaml") && fs.statSync(path.join(SRC_DIR, f)).isFile());
}

// If a version tag was provided, replace the version segment in $id
// e.g. "https://example.com/schemas/1.0.0/dcat.yaml" → ".../v1.2.0/..."
function patchVersion(schema, ver) {
  if (schema.$id && ver) {
    schema.$id = schema.$id.replace(/\/\d+\.\d+\.\d+\//, `/${ver}/`);
  }
  return schema;
}

async function build() {
  ensureDir(RESOLVED_DIR);
  ensureDir(BUNDLED_DIR);

  const files = discoverSchemas();
  console.log(`Found ${files.length} schema(s): ${files.join(", ")}`);

  for (const file of files) {
    const srcPath = path.join(SRC_DIR, file);
    const baseName = path.basename(file, ".yaml");

    // --- Fully resolved (no $ref) ---
    const resolved = await $RefParser.dereference(srcPath);
    patchVersion(resolved, version);
    const resolvedOut = path.join(RESOLVED_DIR, `${baseName}.json`);
    fs.writeFileSync(resolvedOut, JSON.stringify(resolved, null, 2));
    console.log(`  resolved → ${path.relative(process.cwd(), resolvedOut)}`);

    // --- Bundled (internal $ref only) ---
    const bundled = await $RefParser.bundle(srcPath);
    patchVersion(bundled, version);
    const bundledOut = path.join(BUNDLED_DIR, `${baseName}.json`);
    fs.writeFileSync(bundledOut, JSON.stringify(bundled, null, 2));
    console.log(`  bundled  → ${path.relative(process.cwd(), bundledOut)}`);
  }

  console.log("Done.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
