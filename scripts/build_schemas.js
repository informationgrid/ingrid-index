const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const $RefParser = require("@apidevtools/json-schema-ref-parser");

const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const PKG = require(path.join(ROOT_DIR, "package.json"));

// Version defaults to "draft", but is overridden by CI with the release
// tag: --version 8.4.0
const versionFlag = process.argv.indexOf("--version");
const version =
  versionFlag !== -1 ? process.argv[versionFlag + 1] : "draft";

const DIST_DIR = path.join(ROOT_DIR, "dist", version, "schema");

function ensureDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// Discover main schema files (top-level *.yaml in src/, ignore subdirs).
// When building a versioned release (version !== "draft"), files marked
// x-wip: true are excluded.
function discoverSchemas() {
  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".yaml") && fs.statSync(path.join(SRC_DIR, f)).isFile());

  if (version === "draft") return files;

  return files.filter((f) => {
    const doc = yaml.load(fs.readFileSync(path.join(SRC_DIR, f), "utf8"));
    return doc["x-wip"] !== true;
  });
}

// Set $id from package.json's "homepage", e.g.
// "https://schema.ingrid-oss.eu/index/8.4.0/schema/index-dcat.json"
// Placed right after "title" so it's visible near the top of the file.
function setId(schema, ver, baseName) {
  const id = `${PKG.homepage}/${ver}/schema/${baseName}.json`;
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

async function build() {
  ensureDir(DIST_DIR);

  const files = discoverSchemas();
  console.log(`Found ${files.length} schema(s): ${files.join(", ")}`);

  for (const file of files) {
    const srcPath = path.join(SRC_DIR, file);
    const baseName = path.basename(file, ".yaml");

    // --- Fully resolved (no $ref) ---
    const resolved = await $RefParser.dereference(srcPath);
    delete resolved["x-wip"];
    const ordered = setId(resolved, version, baseName);
    const resolvedOut = path.join(DIST_DIR, `${baseName}.json`);
    fs.writeFileSync(resolvedOut, JSON.stringify(ordered, null, 2));
    console.log(`  resolved → ${path.relative(process.cwd(), resolvedOut)}`);
  }

  console.log("Done.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
