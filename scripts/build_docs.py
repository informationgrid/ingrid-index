"""Generate HTML documentation for each YAML schema in src/."""

import argparse
import sys
from html import escape
from pathlib import Path

import yaml
from json_schema_for_humans.generate import generate_from_filename
from json_schema_for_humans.generation_configuration import GenerationConfiguration

sys.path.insert(0, str(Path(__file__).parent))
from html_common import render_page

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
    """Return top-level *.yaml files in src/ (skip subdirectories like parts/).
    When building a versioned release, files marked x-wip: true are excluded."""
    files = sorted(p for p in SRC_DIR.iterdir() if p.suffix == ".yaml" and p.is_file())
    if VERSION == "draft":
        return files
    return [p for p in files if not _is_wip(p)]


def _is_wip(schema_path):
    with open(schema_path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    return doc.get("x-wip") is True


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
    table = (
        f"<table>\n"
        f"    <thead><tr><th>Documentation</th><th>JSON Schema</th><th>Source</th></tr></thead>\n"
        f"    <tbody>\n{rows}\n    </tbody>\n  </table>"
    )
    html = render_page(
        title=f"InGrid Index {escape(VERSION)}",
        h1=f"InGrid Index {escape(VERSION)}",
        h2="Schemas",
        body_content=table,
        version=escape(VERSION),
    )
    index_path = DOCS_DIR / "index.html"
    index_path.write_text(html, encoding="utf-8")
    print(f"  index -> {index_path.relative_to(SRC_DIR.parent)}")


def build():
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    for html_file in DOCS_DIR.glob("*.html"):
        html_file.unlink()

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
        json_filename = f"{schema_path.stem}.json"
        entries.append((read_title(schema_path), out_file.name, schema_path.name, json_filename))

    generate_index(entries)
    print("Done.")


if __name__ == "__main__":
    build()
