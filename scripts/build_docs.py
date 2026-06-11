"""Generate HTML documentation for each YAML schema in src/."""

import argparse
from html import escape
from pathlib import Path

import yaml
from json_schema_for_humans.generate import generate_from_filename
from json_schema_for_humans.generation_configuration import GenerationConfiguration

ROOT_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT_DIR / "src"


def get_version():
    """Version defaults to "draft", but is overridden by CI with the
    release tag: --version 8.4.0"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default="draft")
    return parser.parse_args().version


VERSION = get_version()
DOCS_DIR = ROOT_DIR / "dist" / VERSION


def discover_schemas():
    """Return top-level *.yaml files in src/ (skip subdirectories like parts/)."""
    return sorted(p for p in SRC_DIR.iterdir() if p.suffix == ".yaml" and p.is_file())


def read_title(schema_path):
    """Extract the top-level title from a YAML schema file."""
    with open(schema_path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    return doc.get("title", schema_path.stem)


def generate_index(entries):
    """Write docs/index.html listing all generated schema docs."""
    rows = "\n".join(
        f'        <tr><td><a href="{escape(filename)}">{escape(title)}</a></td>'
        f'<td><a href="{escape(json_filename)}">{escape(json_filename)}</a></td>'
        f"<td><code>{escape(source)}</code></td></tr>"
        for title, filename, source, json_filename in entries
    )
    html = f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>InGrid Index Documentation & Schemas</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 720px; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ text-align: left; padding: .5rem .75rem; border-bottom: 1px solid #ddd; }}
    a {{ color: #0366d6; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
  </style>
</head>
<body>
  <h1>InGrid Index &ndash; Schema Documentation ({escape(VERSION)})</h1>
  <table>
    <thead><tr><th>Documentation</th><th>JSON Schema</th><th>Source</th></tr></thead>
    <tbody>
{rows}
    </tbody>
  </table>
</body>
</html>
"""
    index_path = DOCS_DIR / "index.html"
    index_path.write_text(html, encoding="utf-8")
    print(f"  index -> {index_path.relative_to(SRC_DIR.parent)}")


def build():
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    config = GenerationConfiguration(
        template_name="js",  # interactive HTML template
        show_breadcrumbs=True,
    )

    schemas = discover_schemas()
    print(f"Found {len(schemas)} schema(s): {', '.join(p.name for p in schemas)}")

    entries = []
    for schema_path in schemas:
        out_file = DOCS_DIR / f"{schema_path.stem}.html"
        generate_from_filename(str(schema_path), str(out_file), config=config)
        print(f"  docs -> {out_file.relative_to(SRC_DIR.parent)}")
        json_filename = f"schema/{schema_path.stem}.json"
        entries.append((read_title(schema_path), out_file.name, schema_path.name, json_filename))

    generate_index(entries)
    print("Done.")


if __name__ == "__main__":
    build()
