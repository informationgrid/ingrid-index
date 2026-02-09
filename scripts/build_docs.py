"""Generate HTML documentation for each YAML schema in src/."""

# import os
# import sys
from pathlib import Path

from json_schema_for_humans.generate import generate_from_filename
from json_schema_for_humans.generation_configuration import GenerationConfiguration

SRC_DIR = Path(__file__).resolve().parent.parent / "src"
DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"


def discover_schemas():
    """Return top-level *.yaml files in src/ (skip subdirectories like parts/)."""
    return sorted(p for p in SRC_DIR.iterdir() if p.suffix == ".yaml" and p.is_file())


def build():
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    config = GenerationConfiguration(
        template_name="js",  # interactive HTML template
        show_breadcrumbs=True,
    )

    schemas = discover_schemas()
    print(f"Found {len(schemas)} schema(s): {', '.join(p.name for p in schemas)}")

    for schema_path in schemas:
        out_file = DOCS_DIR / f"{schema_path.stem}.html"
        generate_from_filename(str(schema_path), str(out_file), config=config)
        print(f"  docs -> {out_file.relative_to(SRC_DIR.parent)}")

    print("Done.")


if __name__ == "__main__":
    build()
