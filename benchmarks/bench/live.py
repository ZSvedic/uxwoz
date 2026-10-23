"""In-memory pub/sub with full replay, so a late subscriber still gets every event."""

from __future__ import annotations

import asyncio
from collections import OrderedDict


class Channel:
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.closed = False
        self._cond = asyncio.Condition()

    async def publish(self, event: dict, close: bool = False) -> None:
        async with self._cond:
            self.events.append(event)
            self.closed = self.closed or close
            self._cond.notify_all()

    async def close(self) -> None:
        async with self._cond:
            self.closed = True
            self._cond.notify_all()

    async def subscribe(self):
        i = 0
        while True:
            async with self._cond:
                while i >= len(self.events) and not self.closed:
                    await self._cond.wait()
                batch = self.events[i:]
                i = len(self.events)
                closed = self.closed
            for ev in batch:
                yield ev
            if closed and i >= len(self.events):
                return


class Bus:
    def __init__(self, keep: int = 200) -> None:
        self._channels: OrderedDict[str, Channel] = OrderedDict()
        self._keep = keep

    def get(self, key: str) -> Channel:
        ch = self._channels.get(key)
        if ch is None:
            ch = self._channels[key] = Channel()
            while len(self._channels) > self._keep:
                self._channels.popitem(last=False)
        return ch

    def has(self, key: str) -> bool:
        return key in self._channels


bus = Bus()
