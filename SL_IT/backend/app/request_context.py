from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request


@dataclass(frozen=True)
class RequestContext:
    request_id: str
    ip: str | None = None
    user_agent: str | None = None


def get_request_context(request: Request) -> RequestContext:
    request_id = getattr(request.state, "request_id", None) or "unknown"
    return RequestContext(
        request_id=request_id,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
    )
