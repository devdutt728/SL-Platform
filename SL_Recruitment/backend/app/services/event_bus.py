from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Dict

import redis.asyncio as redis


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._lock = asyncio.Lock()
        self._redis_url = os.environ.get("REDIS_URL", "").strip()
        self._redis: redis.Redis | None = None
        self._redis_lock = asyncio.Lock()
        self._listener_task: asyncio.Task | None = None
        self._channel = "slr:events"

    async def _broadcast(self, data: str) -> None:
        async with self._lock:
            for queue in list(self._subscribers):
                if queue.full():
                    try:
                        queue.get_nowait()
                    except Exception:
                        pass
                try:
                    queue.put_nowait(data)
                except Exception:
                    continue

    async def _ensure_redis(self) -> bool:
        if not self._redis_url:
            return False
        if self._redis is None:
            async with self._redis_lock:
                if self._redis is None:
                    self._redis = redis.from_url(self._redis_url, decode_responses=True)
        await self._ensure_listener()
        return True

    async def _ensure_listener(self) -> None:
        if self._listener_task and not self._listener_task.done():
            return
        self._listener_task = asyncio.create_task(self._listen())

    async def _listen(self) -> None:
        if not self._redis:
            return
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(self._channel)
        try:
            async for message in pubsub.listen():
                if not message or message.get("type") != "message":
                    continue
                data = message.get("data")
                if isinstance(data, bytes):
                    data = data.decode()
                if not isinstance(data, str):
                    continue
                await self._broadcast(data)
        finally:
            await pubsub.close()

    async def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=200)
        async with self._lock:
            self._subscribers.add(queue)
        await self._ensure_redis()
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)

    async def publish(self, payload: Dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if await self._ensure_redis():
            try:
                if self._redis:
                    await self._redis.publish(self._channel, data)
                    return
            except Exception:
                # Fall back to local broadcast on Redis failure.
                pass
        await self._broadcast(data)


event_bus = EventBus()
