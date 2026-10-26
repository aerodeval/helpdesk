"""Reads the Seed Data fixture.

    fixture/meta.json   {"seed_version": "1", "personas": {"agent": <email>, "customer": <email>}}
    fixture/<entity>.json   a list of Frappe documents, each with its "doctype"
    fixture/settings.json   HD Settings values, saved before any insert

Entities are inserted in ENTITIES order; a missing file is skipped. Any Date or Datetime
field, and `creation`, may be an offset from the anchor T: "T", "T-3d4h", "T+30m".
An HD Ticket may also carry `response_by` / `resolution_by` offsets, which pin the SLA
targets, and a `thread` of events (see replay.Replay.EVENTS).
"""

import json
import re
from datetime import datetime, timedelta
from pathlib import Path

FIXTURE_DIR = Path(__file__).parent / "fixture"
ENTITIES = ("sla", "agents", "customers", "contacts", "kb", "saved_replies", "tickets")
OFFSET = re.compile(r"^T(?:([+-])((?:\d+[dhms])+))?$")
UNITS = {"d": "days", "h": "hours", "m": "minutes", "s": "seconds"}


class Fixture:
    def __init__(self, path: str | Path = FIXTURE_DIR):
        self.path = Path(path)
        self.meta = self.read("meta")

    @property
    def seed_version(self) -> str:
        return str(self.meta["seed_version"])

    @property
    def personas(self) -> dict:
        return self.meta.get("personas", {})

    @property
    def settings(self) -> dict:
        if not (self.path / "settings.json").exists():
            return {}
        return {k: v for k, v in self.read("settings").items() if k != "doctype"}

    def records(self) -> list[dict]:
        return [
            record
            for entity in ENTITIES
            if (self.path / f"{entity}.json").exists()
            for record in self.read(entity)
        ]

    def read(self, name: str):
        return json.loads((self.path / f"{name}.json").read_text())


def is_offset(value) -> bool:
    return isinstance(value, str) and bool(OFFSET.match(value))


def resolve_offset(value: str, anchor: datetime) -> datetime:
    sign, parts = OFFSET.match(value).groups()
    units = re.findall(r"(\d+)([dhms])", parts or "")
    delta = timedelta(**{UNITS[unit]: int(amount) for amount, unit in units})
    return anchor - delta if sign == "-" else anchor + delta
