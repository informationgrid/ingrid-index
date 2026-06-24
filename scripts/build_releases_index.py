"""Generate the root index.html for the "releases" branch.

Lists each version folder found in the given directory, linking to its
index.html. "draft" is listed first, then released versions newest-first.
"""

import argparse
import sys
from html import escape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from html_common import render_page


def version_key(name):
    """Sort key for version folder names, e.g. "8.10.0" > "8.9.0"."""
    parts = []
    for part in name.split("."):
        parts.append((0, int(part)) if part.isdigit() else (1, part))
    return tuple(parts)


def discover_versions(directory):
    """Return version folder names in directory, "draft" first, then
    released versions newest-first."""
    versions = sorted(
        (p.name for p in directory.iterdir() if p.is_dir() and p.name != "draft"),
        key=version_key,
        reverse=True,
    )
    if (directory / "draft").is_dir():
        versions.insert(0, "draft")
    return versions


def generate_index(directory, versions):
    items = "\n".join(
        f'    <li><a href="/index/{escape(v)}/index.html">{escape(v)}</a></li>' for v in versions
    )
    html = render_page(
        title="InGrid Index",
        h1="InGrid Index",
        h2="Versions",
        body_content=f"<ul>\n{items}\n  </ul>",
        version=None,
    )
    index_path = directory / "index.html"
    index_path.write_text(html, encoding="utf-8")
    print(f"  index -> {index_path}")


def build():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", nargs="?", default="dist")
    directory = Path(parser.parse_args().directory)

    versions = discover_versions(directory)
    print(f"Found {len(versions)} version(s): {', '.join(versions)}")
    generate_index(directory, versions)


if __name__ == "__main__":
    build()
