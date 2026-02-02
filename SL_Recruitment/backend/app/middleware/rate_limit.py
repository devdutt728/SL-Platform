import time
from collections import defaultdict, deque
from typing import Deque

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip() or "unknown"
    xrip = request.headers.get("x-real-ip")
    if xrip:
        return xrip.strip()
    if request.client:
        return request.client.host
    return "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        limit: int,
        window_seconds: int,
        path_prefixes: tuple[str, ...] = ("/auth",),
    ) -> None:
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
        self.path_prefixes = path_prefixes
        self._hits: dict[str, Deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith(self.path_prefixes):
            return await call_next(request)

        now = time.time()
        key = f"{_client_ip(request)}:{path}"
        q = self._hits[key]
        cutoff = now - self.window_seconds
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= self.limit:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"error": "rate_limited", "detail": "Too many requests. Please retry shortly."},
            )
        q.append(now)
        return await call_next(request)
