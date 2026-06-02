from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

from app.models.opening import RecOpening

_JD_DIR = Path(__file__).resolve().parents[1] / "JD"
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_NOISE_TOKENS = {"sl", "studio", "lotus", "job", "jd", "description", "role", "pdf"}
_TITLE_ALIAS_TO_FILE: dict[str, str] = {
    "architect": "SL Architect.pdf",
    "associate": "SL Associate - Interior Design.pdf",
    "associate interior design": "SL Associate - Interior Design.pdf",
    "comms designer": "SL Communications Designer.pdf",
    "communications designer": "SL Communications Designer.pdf",
    "communications intern": "SL Communications Intern.pdf",
    "graphic designer": "SL Graphic Designer.pdf",
    "group leader": "SL Group Leader Architecture.pdf",
    "group leader architecture": "SL Group Leader Architecture.pdf",
    "interior designer": "SL Interior Designer.pdf",
    "intern": "SL Intern.pdf",
    "project designer": "SL Project Designer - Interior Design.pdf",
    "project designer interior design": "SL Project Designer - Interior Design.pdf",
    "sr architect": "Sr. Architect.pdf",
    "sr designer": "SL Sr. Designer - Interior Design.pdf",
    "sr designer interior design": "SL Sr. Designer - Interior Design.pdf",
}
_OPENING_CODE_ALIAS_TO_FILE: dict[str, str] = {
    "CMDS-8299CF": "SL Communications Designer.pdf",
    "GRDS-8299C7": "SL Graphic Designer.pdf",
}


@dataclass(frozen=True)
class JdAsset:
    file_name: str
    display_name: str
    path: Path
    tokens: tuple[str, ...]
    compact: str


def _tokenize(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    tokens = [token for token in _TOKEN_RE.findall(value.lower()) if token and token not in _NOISE_TOKENS]
    return tuple(tokens)


def _compact(tokens: tuple[str, ...]) -> str:
    return "".join(tokens)


def _display_name(file_name: str) -> str:
    return Path(file_name).stem.replace("_", " ").strip()


def list_jd_assets() -> list[JdAsset]:
    if not _JD_DIR.exists() or not _JD_DIR.is_dir():
        return []
    assets: list[JdAsset] = []
    for path in sorted(_JD_DIR.glob("*.pdf")):
        file_name = path.name
        tokens = _tokenize(path.stem)
        assets.append(
            JdAsset(
                file_name=file_name,
                display_name=_display_name(file_name),
                path=path,
                tokens=tokens,
                compact=_compact(tokens),
            )
        )
    return assets


def get_jd_asset_by_file_name(file_name: str | None) -> JdAsset | None:
    normalized = (file_name or "").strip()
    if not normalized:
        return None
    for asset in list_jd_assets():
        if asset.file_name == normalized:
            return asset
    return None


def _score_asset(title_tokens: tuple[str, ...], title_compact: str, asset: JdAsset) -> tuple[int, int, int, str] | None:
    if not title_tokens:
        return None
    asset_token_set = set(asset.tokens)
    title_token_set = set(title_tokens)
    if asset.tokens == title_tokens or asset.compact == title_compact:
        return (0, 0, len(asset.tokens), asset.file_name)
    if title_token_set.issubset(asset_token_set):
        extra = len(asset_token_set) - len(title_token_set)
        contains_compact = 0 if title_compact and title_compact in asset.compact else 1
        return (1, contains_compact, extra, asset.file_name)
    if title_compact and title_compact in asset.compact:
        return (2, len(asset.tokens), len(asset.compact), asset.file_name)
    return None


def resolve_opening_jd_asset(opening: RecOpening | None) -> JdAsset | None:
    if not opening:
        return None
    explicit = get_jd_asset_by_file_name(opening.jd_file_name)
    if explicit:
        return explicit
    code_key = (opening.opening_code or "").strip().upper()
    code_file_name = _OPENING_CODE_ALIAS_TO_FILE.get(code_key)
    if code_file_name:
        code_asset = get_jd_asset_by_file_name(code_file_name)
        if code_asset:
            return code_asset
    alias_key = " ".join(_tokenize(opening.title))
    aliased_file_name = _TITLE_ALIAS_TO_FILE.get(alias_key)
    if aliased_file_name:
        aliased = get_jd_asset_by_file_name(aliased_file_name)
        if aliased:
            return aliased
    title_tokens = _tokenize(opening.title)
    title_compact = _compact(title_tokens)
    best: tuple[tuple[int, int, int, str], JdAsset] | None = None
    for asset in list_jd_assets():
        score = _score_asset(title_tokens, title_compact, asset)
        if score is None:
            continue
        if best is None or score < best[0]:
            best = (score, asset)
    return best[1] if best else None
