const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { resolveSchema } = require("./x_transform_lib");

const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const PKG = require(path.join(ROOT_DIR, "package.json"));

// Version defaults to "draft", but is overridden by CI with the release
// tag: --version 8.4.0
const versionFlag = process.argv.indexOf("--version");
const version =
  versionFlag !== -1 ? process.argv[versionFlag + 1] : "draft";

const DIST_DIR = path.join(ROOT_DIR, "dist", version, "schema");
// Same schemas including the x-transform mapping annotations, which are
// stripped from the published ones (see README.md).
const ANNOTATED_DIR = path.join(DIST_DIR, "annotated");

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

// $id from package.json's "homepage", e.g.
// "https://schema.ingrid-oss.eu/index/8.4.0/schema/index-dcat.json"
function schemaId(ver, baseName, subDir = "") {
  return `${PKG.homepage}/${ver}/schema/${subDir}${baseName}.json`;
}

async function build() {
  ensureDir(DIST_DIR);
  fs.mkdirSync(ANNOTATED_DIR);

  const files = discoverSchemas();
  console.log(`Found ${files.length} schema(s): ${files.join(", ")}`);

  for (const file of files) {
    const srcPath = path.join(SRC_DIR, file);
    const baseName = path.basename(file, ".yaml");

    // --- Fully resolved (no $ref), with and without x-transform ---
    const { annotated, published } = await resolveSchema(
      srcPath,
      schemaId(version, baseName),
      schemaId(version, baseName, "annotated/")
    );
    const resolvedOut = path.join(DIST_DIR, `${baseName}.json`);
    fs.writeFileSync(resolvedOut, published);
    console.log(`  resolved → ${path.relative(process.cwd(), resolvedOut)}`);
    const annotatedOut = path.join(ANNOTATED_DIR, `${baseName}.json`);
    fs.writeFileSync(annotatedOut, annotated);
    console.log(`  annotated → ${path.relative(process.cwd(), annotatedOut)}`);
  }

  console.log("Done.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
