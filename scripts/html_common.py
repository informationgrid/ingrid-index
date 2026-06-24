"""Shared HTML page template for generated index pages."""

LOGO_URL = "https://avatars.githubusercontent.com/u/9720479"
GITHUB_URL = "https://github.com/informationgrid/ingrid-index"
INGRID_URL = "https://ingrid-oss.eu/"
SCHEMA_ROOT_URL = "https://schema.ingrid-oss.eu/"
SCHEMA_INDEX_URL = f"{SCHEMA_ROOT_URL}index/"


def _breadcrumb(version=None):
    crumbs = (
        f'<a href="{SCHEMA_ROOT_URL}">schema</a> / '
        f'<a href="{SCHEMA_INDEX_URL}">index</a>'
    )
    if version:
        crumbs += f" / {version}"
    return f'<nav style="font-size:.875rem; margin-bottom:1.5rem;">{crumbs}</nav>'


def render_page(title, h1, h2, body_content, version=None):
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 720px; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ text-align: left; padding: .5rem .75rem; border-bottom: 1px solid #ddd; }}
    ul {{ padding-left: 1.2rem; }}
    a {{ color: #0366d6; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
  </style>
</head>
<body>
  <div style="display:flex; align-items:center; gap:1rem;">
    <img src="{LOGO_URL}" alt="InGrid logo" width="64" height="64" style="border-radius:50%;">
    <h1 style="margin:0;">{h1}</h1>
  </div>
  {_breadcrumb(version)}
  <p>
    The InGrid Index is a set of standardized, versioned JSON Schemas defining the structure of
    metadata records exchanged within the <a href="{INGRID_URL}">InGrid</a> platform.
    This site provides fully resolved JSON schemas and HTML documentation for all index variants.
    Source code and issue tracking are available on
    <a href="{GITHUB_URL}">GitHub</a>.
  </p>
  <h2>{h2}</h2>
  {body_content}
</body>
</html>
"""
