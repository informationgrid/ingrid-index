"""Generate HTML documentation for each YAML schema in src/."""

import argparse
import re
import shutil
import sys
import tempfile
from html import escape
from html.parser import HTMLParser
from pathlib import Path

import yaml
from json_schema_for_humans.generate import generate_from_filename
from json_schema_for_humans.generation_configuration import GenerationConfiguration

sys.path.insert(0, str(Path(__file__).parent))
from html_common import render_page, _breadcrumb

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


# ── x-transform: mapping descriptions in the HTML docs (see README.md) ──
# json-schema-for-humans ignores unknown keywords, so the annotations are
# appended to the description of each field. This happens only in a temporary
# copy of src/, never in the sources.

ANNOTATION = "x-transform"
# Declaration of the source formats.
SOURCES_FILE = SRC_DIR / "parts" / "x-transform-sources.yaml"


def load_transform_sources(schema_name):
    """The declared source formats that are documented for this schema
    (`schemas` in src/parts/x-transform-sources.yaml; without it, for all schemas)."""
    if not SOURCES_FILE.exists():
        return {}
    with open(SOURCES_FILE, encoding="utf-8") as f:
        declared = yaml.safe_load(f) or {}
    return {
        key: decl for key, decl in declared.items()
        if not isinstance(decl.get("schemas"), list) or schema_name in decl["schemas"]
    }


BLOCK_START = re.compile(r"^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|```|\|)")


def join_lines(md):
    """Joins the lines of a paragraph, list item or comment (blockquote): the renderer turns every
    line break into <br>, so breaks in the YAML source would show up."""
    out = []
    fence = False
    for line in md.replace("\r\n", "\n").split("\n"):
        trimmed = line.strip()
        if trimmed.startswith("```"):
            fence = not fence
        prev = out[-1] if out else ""
        prev_trimmed = prev.strip()
        joinable = (not fence and not trimmed.startswith("```") and prev_trimmed and trimmed
                    and not re.match(r"^#{1,6}\s", prev_trimmed))
        if joinable and prev_trimmed.startswith(">") and trimmed.startswith(">") and ">" not in (trimmed, prev_trimmed):
            out[-1] = prev.rstrip() + " " + re.sub(r"^>\s?", "", trimmed)
        elif joinable and not trimmed.startswith(">") and not prev_trimmed.startswith(">") and not BLOCK_START.match(line):
            out[-1] = f"{prev.rstrip()} {trimmed}"
        else:
            out.append(line)
    return "\n".join(out)


def shift_headings(md, by):
    """Moves all headings of a description down by `by` levels (at most level 6)."""
    return re.sub(r"(?m)^(#{1,6})(?=\s)", lambda m: "#" * min(6, len(m.group(1)) + by), md)


def escape_intraword_underscores(md):
    """Underscores inside words (date_range, CI_Date) would become emphasis; code stays as it is."""
    parts = re.split(r"(```[\s\S]*?```|`[^`]*`)", md)
    return "".join(p if p.startswith("`") else re.sub(r"(?<=\w)_(?=\w)", r"\\_", p) for p in parts)


def render_transformation(texts, sources):
    """Markdown section "Transformation" with a heading per source format (its title) and the
    Markdown text for it below; the headings of the text start at "#"."""
    sections = [
        f"#### {sources[key].get('title', key)}\n\n"
        + escape_intraword_underscores(shift_headings(join_lines(texts[key].strip()), 4))
        for key in sources if isinstance(texts.get(key), str)
    ]
    return "### Transformation\n\n" + "\n\n".join(sections) if sections else ""


def append_description(node, text):
    if text:
        description = node.get("description")
        node["description"] = f"{description.rstrip()}\n\n{text}" if description else text


def annotate_node(node, sources):
    """Moves every x-transform into the description of its field."""
    if isinstance(node, list):
        for item in node:
            annotate_node(item, sources)
    elif isinstance(node, dict):
        annotation = node.pop(ANNOTATION, None)
        if isinstance(annotation, dict):
            append_description(node, render_transformation(annotation, sources))
        for value in node.values():
            annotate_node(value, sources)


def copy_annotated_sources(target_dir, schema_name):
    """Writes a copy of src/ with the annotations for this schema moved into the descriptions,
    and the general rules of the source formats in the description of the schema itself."""
    sources = load_transform_sources(schema_name)
    for path in SRC_DIR.rglob("*.yaml"):
        with open(path, encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        annotate_node(doc, sources)
        if path == SRC_DIR / f"{schema_name}.yaml" and isinstance(doc, dict):
            # the general rules of the source formats, which the field descriptions rely on
            append_description(doc, render_transformation(
                {key: decl.get("description") for key, decl in sources.items()}, sources))
        out = target_dir / path.relative_to(SRC_DIR)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            yaml.safe_dump(doc, f, allow_unicode=True, sort_keys=False, width=1000)


def read_title(schema_path):
    """Extract the top-level title from a YAML schema file."""
    with open(schema_path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    return doc.get("title", schema_path.stem)


class _BodyTagLocator(HTMLParser):
    """Finds the character offset right after the opening <body> tag."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.body_end = None

    def handle_starttag(self, tag, attrs):
        if tag == "body" and self.body_end is None:
            line, col = self.getpos()
            self.body_end = (line, col + len(self.get_starttag_text()))


def _offset_of(html, line, col):
    """Convert a 1-indexed (line, col) from HTMLParser.getpos() to a flat char offset."""
    lines = html.splitlines(keepends=True)
    return sum(len(l) for l in lines[: line - 1]) + col


# Comments (> …) in the x-transform descriptions; the template does not style <blockquote>.
EXTRA_STYLE = """<style>
  blockquote {
    margin: .5rem 0 1rem;
    padding: .4rem .9rem;
    border-left: 4px solid #ced4da;
    background: #f8f9fa;
    color: #495057;
    font-size: .95em;
  }
  blockquote p:last-child { margin-bottom: 0; }
</style>
"""


def inject_header(html_path):
    """Insert the back-to-index header right after <body> and the extra style before </head>
    in a generated doc page."""
    html = html_path.read_text(encoding="utf-8")
    if "</head>" not in html:
        raise RuntimeError(f"No </head> tag found in {html_path}")
    html = html.replace("</head>", EXTRA_STYLE + "</head>", 1)
    locator = _BodyTagLocator()
    locator.feed(html)
    if locator.body_end is None:
        raise RuntimeError(f"No <body> tag found in {html_path}")
    offset = _offset_of(html, *locator.body_end)
    html = html[:offset] + _breadcrumb(version=escape(VERSION)) + html[offset:]
    html_path.write_text(html, encoding="utf-8")


def generate_index(entries):
    """Write dist/<version>/index.html listing all generated schema docs."""
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
    annotated_src = Path(tempfile.mkdtemp(prefix="ingrid-index-docs-"))
    try:
        for schema_path in schemas:
            # one copy per schema, as the documented source formats differ per schema
            schema_src = annotated_src / schema_path.stem
            copy_annotated_sources(schema_src, schema_path.stem)
            out_file = DOCS_DIR / f"{schema_path.stem}.html"
            generate_from_filename(str(schema_src / schema_path.name), str(out_file), config=config)
            inject_header(out_file)
            print(f"  docs -> {out_file.relative_to(SRC_DIR.parent)}")
            json_filename = f"schema/{schema_path.stem}.json"
            entries.append((read_title(schema_path), out_file.name, schema_path.name, json_filename))
    finally:
        shutil.rmtree(annotated_src, ignore_errors=True)

    generate_index(entries)
    print("Done.")


if __name__ == "__main__":
    build()
