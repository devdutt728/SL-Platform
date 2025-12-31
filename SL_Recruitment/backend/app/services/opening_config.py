from __future__ import annotations

import json
from typing import Optional

from app.services.screening_rules import OpeningConfig


def get_opening_config(opening_id: int | None) -> Optional[OpeningConfig]:
    """
    Minimal config loader.

    Provide SL_OPENING_CONFIG_JSON like:
    {
      "12": {"requires_relocation": true, "salary_band_max_annual": 1800000}
    }
    """
    if not opening_id:
        return None

    import os

    env_value = os.environ.get("SL_OPENING_CONFIG_JSON")

    if not env_value:
        return None

    try:
        raw = json.loads(env_value)
    except json.JSONDecodeError:
        return None

    cfg = raw.get(str(opening_id))
    if not isinstance(cfg, dict):
        return None

    return OpeningConfig(
        requires_relocation=bool(cfg.get("requires_relocation", False)),
        salary_band_max_annual=cfg.get("salary_band_max_annual"),
    )
