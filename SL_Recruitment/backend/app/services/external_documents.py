from dataclasses import dataclass
import logging
import mimetypes
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

from fastapi import HTTPException, status

from app.core.uploads import sanitize_filename

logger = logging.getLogger("slr.external_documents")


@dataclass(slots=True)
class DownloadedExternalDocument:
    data: bytes
    filename: str
    content_type: str
    advertised_size_bytes: int | None = None
    final_url: str | None = None


def _parse_content_length(raw_value: str | None) -> int | None:
    if raw_value is None:
        return None
    text = str(raw_value).strip()
    if not text:
        return None
    try:
        value = int(text)
    except (TypeError, ValueError):
        return None
    return value if value >= 0 else None


def _format_megabytes(size_bytes: int) -> str:
    return f"{size_bytes / (1024 * 1024):.2f}MB"


def _build_too_large_detail(url: str, *, actual_bytes: int, max_bytes: int) -> str:
    return (
        f"File from '{url}' is {_format_megabytes(actual_bytes)}; "
        f"max allowed is {_format_megabytes(max_bytes)}."
    )


def _request_metadata(url: str, *, user_agent: str, timeout_seconds: int) -> tuple[int | None, str | None, str | None]:
    request = Request(url, method="HEAD", headers={"User-Agent": user_agent})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return (
                _parse_content_length(response.headers.get("Content-Length")),
                (response.headers.get_content_type() or "application/octet-stream").strip().lower(),
                response.geturl(),
            )
    except HTTPError:
        return None, None, None
    except URLError:
        return None, None, None
    except Exception:
        return None, None, None


def download_external_document(
    url: str,
    *,
    max_bytes: int,
    user_agent: str,
    timeout_seconds: int = 25,
) -> DownloadedExternalDocument:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported URL scheme for '{url}'.")

    head_size, head_content_type, head_final_url = _request_metadata(
        url,
        user_agent=user_agent,
        timeout_seconds=timeout_seconds,
    )
    if head_size is not None and head_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_build_too_large_detail(url, actual_bytes=head_size, max_bytes=max_bytes),
        )

    request = Request(url, headers={"User-Agent": user_agent})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = (response.headers.get_content_type() or head_content_type or "application/octet-stream").strip().lower()
            final_url = response.geturl() or head_final_url or url
            response_size = _parse_content_length(response.headers.get("Content-Length"))
            advertised_size = response_size if response_size is not None else head_size
            if advertised_size is not None and advertised_size > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=_build_too_large_detail(url, actual_bytes=advertised_size, max_bytes=max_bytes),
                )

            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    if advertised_size is not None and advertised_size <= max_bytes:
                        logger.warning(
                            "External file size metadata mismatch: url=%s advertised_size=%s streamed_size_gt=%s final_url=%s",
                            url,
                            advertised_size,
                            max_bytes,
                            final_url,
                        )
                        raise HTTPException(
                            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=(
                                f"File from '{url}' could not be downloaded reliably because the source reported an "
                                "inconsistent size. Retry later or replace the file link."
                            ),
                        )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"File from '{url}' exceeds max allowed size of {_format_megabytes(max_bytes)}."
                        ),
                    )
                chunks.append(chunk)
    except HTTPException:
        raise
    except HTTPError as exc:
        if exc.code in {408, 425, 429, 500, 502, 503, 504}:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Could not download file '{url}' (HTTP {exc.code}). Retry later or replace the file link.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not download file '{url}' (HTTP {exc.code}).",
        ) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not download file '{url}' ({exc.reason}). Retry later or replace the file link.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not download file '{url}' ({exc}). Retry later or replace the file link.",
        ) from exc

    raw_name = unquote(Path(urlparse(final_url or url).path or "").name or "document")
    filename = sanitize_filename(raw_name, default="document")
    if "." not in filename:
        guessed_ext = mimetypes.guess_extension(content_type or "") or ""
        if guessed_ext:
            filename = f"{filename}{guessed_ext}"

    return DownloadedExternalDocument(
        data=b"".join(chunks),
        filename=filename,
        content_type=content_type or "application/octet-stream",
        advertised_size_bytes=advertised_size,
        final_url=final_url,
    )
