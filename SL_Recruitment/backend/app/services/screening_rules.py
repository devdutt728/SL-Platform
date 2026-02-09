from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from app.schemas.screening import ScreeningUpsertIn

ScreeningDecision = Literal["green", "amber", "red"]


@dataclass(frozen=True)
class OpeningConfig:
    requires_relocation: bool = False
    salary_band_max_annual: Optional[float] = None


def evaluate_screening(screening: ScreeningUpsertIn, opening_config: Optional[OpeningConfig]) -> ScreeningDecision:
    # If we don't know the opening rules yet, force human review.
    if opening_config is None:
        return "amber"

    if opening_config.requires_relocation and screening.willing_to_relocate is False:
        return "red"

    return "green"
