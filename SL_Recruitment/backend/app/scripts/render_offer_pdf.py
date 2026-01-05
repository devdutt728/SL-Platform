from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from jinja2 import Template


def _find_browser_exe() -> Path:
    env_path = os.environ.get("SL_PDF_BROWSER_PATH") or os.environ.get("SL_CHROME_PATH")
    if env_path:
        path = Path(env_path)
        if path.exists():
            return path
    candidates = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError(
        "Chrome/Edge not found. Set SL_PDF_BROWSER_PATH to chrome.exe or msedge.exe."
    )


def _render(template_path: Path, output_path: Path, ctx_path: Path) -> None:
    template = Template(template_path.read_text(encoding="utf-8"))
    ctx = json.loads(ctx_path.read_text(encoding="utf-8-sig"))
    html = template.render(**ctx)
    base_href = template_path.parent.as_uri().rstrip("/") + "/"
    html = html.replace("<head>", f'<head><base href="{base_href}">', 1)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".html", delete=False, encoding="utf-8") as html_file:
        html_file.write(html)
        html_path = Path(html_file.name)

    try:
        browser = _find_browser_exe()
        cmd = [
            str(browser),
            "--headless",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-dev-shm-usage",
            "--print-to-pdf-no-header",
            f"--print-to-pdf={output_path}",
            html_path.as_uri(),
        ]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    finally:
        try:
            html_path.unlink()
        except Exception:
            pass


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: render_offer_pdf.py <template_path> <output_path> <ctx_json_path>", file=sys.stderr)
        return 2
    template_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    ctx_path = Path(sys.argv[3])
    _render(template_path, output_path, ctx_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
