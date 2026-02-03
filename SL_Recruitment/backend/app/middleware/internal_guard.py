import ipaddress
from typing import Iterable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class InternalGuardMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        api_key: str,
        allow_localhost: bool = True,
        protected_prefixes: Iterable[str] = ("/rec", "/platform", "/admin"),
        header_name: str = "x-internal-api-key",
    ) -> None:
        super().__init__(app)
        self._api_key = (api_key or "").strip()
        self._allow_localhost = allow_localhost
        self._protected_prefixes = tuple(protected_prefixes)
        self._header_name = header_name.lower()

    def _is_localhost(self, request: Request) -> bool:
        host = request.client.host if request.client else ""
        try:
            ip = ipaddress.ip_address(host)
            return ip.is_loopback
        except ValueError:
            return host in {"localhost"}

    async def dispatch(self, request: Request, call_next):
        if not self._api_key:
            return await call_next(request)

        path = request.url.path or "/"
        if not any(path.startswith(prefix) for prefix in self._protected_prefixes):
            return await call_next(request)

        supplied = request.headers.get(self._header_name, "").strip()
        if supplied and supplied == self._api_key:
            return await call_next(request)

        if self._allow_localhost and self._is_localhost(request):
            return await call_next(request)

        return JSONResponse({"detail": "Forbidden"}, status_code=403)
