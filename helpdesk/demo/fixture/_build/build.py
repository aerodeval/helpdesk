"""Assemble the Fernbill fixture from the hand-written sources in this folder.

Run: python3 helpdesk/demo/fixture/_build/build.py

Sources: orgs.txt, threads/*.txt, kb.txt, saved_replies.txt, and the AGENTS table below.
Output: meta.json and one JSON file per entity next to this folder, each a list of
Frappe documents in the shape helpdesk/demo/replay.py inserts. The source grammar is
in the README under "Authoring sources".
"""

import html
import json
import random
import re
import zlib
from pathlib import Path

BUILD = Path(__file__).parent
FIXTURE = BUILD.parent
SEED_VERSION = "fernbill-1"
RECENT_DONE = 28  # resolved tickets opened after the v3 release (T-7d), besides v3 ones
PHOTO_URL = "/assets/helpdesk/demo/{}.svg"

# key, first, last, roles, teams
AGENTS = [
    (
        "jamie",
        "Jamie",
        "Rivera",
        ["Agent", "Agent Manager"],
        ["Billing & Payments", "Technical Support", "Customer Success"],
    ),
    ("ananya", "Ananya", "Iyer", ["Agent"], ["Billing & Payments"]),
    ("tomas", "Tomás", "Herrera", ["Agent"], ["Billing & Payments"]),
    ("kwame", "Kwame", "Mensah", ["Agent"], ["Technical Support"]),
    ("yuki", "Yuki", "Tanaka", ["Agent"], ["Technical Support"]),
    ("sofia", "Sofia", "Lindqvist", ["Agent"], ["Customer Success"]),
]
AGENT_KEYS = {a[0] for a in AGENTS}
TEAMS = ["Billing & Payments", "Technical Support", "Customer Success"]
THEMES = {
    "billing": ("Billing", "Billing & Payments", "Question"),
    "integrations": ("Integrations", "Technical Support", "Question"),
    "bugs": ("Bugs", "Technical Support", "Bug"),
    "howto": ("How-to", "Customer Success", "Question"),
    "account": ("Account/SSO", "Customer Success", "Question"),
    "feature": ("Feature requests", "Customer Success", "Unspecified"),
}
# star rating -> a default HD Ticket Feedback Option label (helpdesk/setup/ticket_feedback.py)
FEEDBACK_OPTIONS = {
    1: "Response did not help",
    2: "Delayed response time",
    3: "Clear guidance given",
    4: "Prompt, informative support",
    5: "Exceptional support experience",
}
# (first response, resolution) in hours per plan and priority
SLA_HOURS = {
    "Enterprise": {
        "Urgent": (1, 8),
        "High": (2, 12),
        "Medium": (4, 24),
        "Low": (8, 48),
    },
    "Growth": {"Urgent": (2, 12), "High": (4, 24), "Medium": (8, 48), "Low": (24, 72)},
    "Starter": {
        "Urgent": (4, 24),
        "High": (8, 48),
        "Medium": (24, 72),
        "Low": (48, 120),
    },
}
# default gaps in minutes before an event, when the source gives none
FIRST_REPLY_GAP = {
    "Urgent": (10, 45),
    "High": (20, 110),
    "Medium": (40, 280),
    "Low": (90, 700),
}
GAP = {"A": (15, 240), "C": (25, 1300), "N": (4, 90), "@": (2, 25)}

HEADER = re.compile(r"^== (.+)$")
EVENT = re.compile(r"^(C|A|N)(?: ([a-z]+))?(?: \+(\w+))?:(?: (.*))?$")
ASSIGN = re.compile(r"^@ ([a-z]+)(?: \+(\w+))?$")


def agent_email(key):
    return f"{key}@fernbill.example"


def slugify(name):
    return re.sub(
        r"-co$",
        "",
        re.sub(r"[^a-z0-9]+", "-", name.lower().replace("&", " ")).strip("-"),
    )


def minutes(spec):
    """'1d2h30m' -> 1590"""
    return sum(
        int(n) * {"d": 1440, "h": 60, "m": 1}[u]
        for n, u in re.findall(r"(\d+)([dhm])", spec)
    )


def offset(mins):
    """Minutes relative to T -> 'T-3d4h12m'."""
    mins = round(mins)
    if mins == 0:
        return "T"
    sign, rest = ("-" if mins < 0 else "+"), abs(mins)
    d, rest = divmod(rest, 1440)
    h, m = divmod(rest, 60)
    return (
        "T" + sign + "".join(f"{v}{u}" for v, u in ((d, "d"), (h, "h"), (m, "m")) if v)
    )


def parse_offset(spec):
    return (-1 if spec[1] == "-" else 1) * minutes(spec[2:])


def html_blocks(text):
    """Paragraphs, '- ' lists, '1. ' lists and '## ' headings to simple HTML."""
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = block.strip().splitlines()
        if all(ln.startswith("- ") for ln in lines):
            out.append(
                "<ul>"
                + "".join(
                    f"<li>{html.escape(ln[2:], quote=False)}</li>" for ln in lines
                )
                + "</ul>"
            )
        elif all(re.match(r"\d+\. ", ln) for ln in lines):
            out.append(
                "<ol>"
                + "".join(
                    f"<li>{html.escape(ln.split('. ', 1)[1], quote=False)}</li>"
                    for ln in lines
                )
                + "</ol>"
            )
        elif lines[0].startswith("## "):
            out.append(f"<h3>{html.escape(lines[0][3:], quote=False)}</h3>")
            if lines[1:]:
                out.append(html_blocks("\n".join(lines[1:])))
        else:
            out.append(
                "<p>"
                + "<br>".join(html.escape(ln, quote=False) for ln in lines)
                + "</p>"
            )
    return "".join(out)


def mention_html(text):
    """'@Jamie' -> the mention span the agent comment editor produces."""
    out = html_blocks(text)
    for key, first, last, *_ in AGENTS:
        span = f'<span class="mention" data-type="mention" data-id="{agent_email(key)}" data-label="{first} {last}">@{first} {last}</span>'
        out = out.replace(f"@{first}", span)
    return out


# ---------- people ----------


def read_orgs():
    orgs = []
    for line in (BUILD / "orgs.txt").read_text().splitlines():
        if not line.strip() or line.startswith("//"):
            continue
        plan, name, industry, country, people = line.split("|")
        slug = slugify(name)
        contacts = []
        for person in people.split(";"):
            full_name, title, *_manager = person.split(":")
            first, last = full_name.split(" ", 1)
            contacts.append(
                {
                    "first": first,
                    "last": last,
                    "title": title,
                    "email": f"{first.lower()}@{slug}.example",
                }
            )
        orgs.append(
            {
                "plan": plan,
                "name": name,
                "industry": industry,
                "country": country,
                "slug": slug,
                "contacts": contacts,
            }
        )
    return orgs


def build_agents():
    users, agents = [], []
    for key, first, last, roles, _teams in AGENTS:
        email, photo = agent_email(key), PHOTO_URL.format(
            f"{first}-{last}".lower().replace("á", "a")
        )
        users.append(
            {
                "doctype": "User",
                "email": email,
                "first_name": first,
                "last_name": last,
                "user_type": "System User",
                "send_welcome_email": 0,
                "user_image": photo,
                "roles": [{"role": r} for r in roles],
            }
        )
        agents.append(
            {
                "doctype": "HD Agent",
                "user": email,
                "agent_name": f"{first} {last}",
                "is_active": 1,
                "user_image": photo,
            }
        )
    teams = [
        {
            "doctype": "HD Team",
            "team_name": team,
            "users": [{"user": agent_email(a[0])} for a in AGENTS if team in a[4]],
        }
        for team in TEAMS
    ]
    return users + agents + teams


def build_customers(orgs):
    return [
        {
            "doctype": "HD Customer",
            "customer_name": o["name"],
            "domain": f"{o['slug']}.example",
            "country": o["country"],
        }
        for o in orgs
    ]


def build_contacts(orgs):
    """Contacts first: a User insert then finds its Contact instead of creating a second one."""
    contacts, users = [], []
    for o in orgs:
        for c in o["contacts"]:
            contacts.append(
                {
                    "doctype": "Contact",
                    "first_name": c["first"],
                    "last_name": c["last"],
                    "designation": c["title"],
                    "company_name": o["name"],
                    "email_ids": [{"email_id": c["email"], "is_primary": 1}],
                    "links": [{"link_doctype": "HD Customer", "link_name": o["name"]}],
                }
            )
            users.append(
                {
                    "doctype": "User",
                    "email": c["email"],
                    "first_name": c["first"],
                    "last_name": c["last"],
                    "user_type": "Website User",
                    "send_welcome_email": 0,
                    # portal sign-up grants it; an insert does not
                    "roles": [{"role": "HD Customer"}],
                }
            )
    return contacts + users


def build_sla(orgs):
    slas = []
    for rank, (plan, prios) in enumerate(SLA_HOURS.items()):
        names = [o["name"] for o in orgs if o["plan"] == plan]
        slas.append(
            {
                "doctype": "HD Service Level Agreement",
                "service_level": plan,
                "description": f"{plan} plan. Support runs every day, around the clock.",
                "enabled": 1,
                "default_sla": int(plan == "Starter"),
                "rank": 3 - rank,
                "default_priority": "Medium",
                "apply_sla_for_resolution": 1,
                "condition": (
                    None
                    if plan == "Starter"
                    else f"doc.customer in {json.dumps(names)}"
                ),
                "holiday_list": "Default",
                "support_and_resolution": [
                    {"workday": d, "start_time": "00:00:00", "end_time": "23:59:59"}
                    for d in (
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                        "Sunday",
                    )
                ],
                "priorities": [
                    {
                        "priority": p,
                        "response_time": r * 3600,
                        "resolution_time": s * 3600,
                        "default_priority": int(p == "Medium"),
                    }
                    for p, (r, s) in prios.items()
                ],
            }
        )
    return slas


# ---------- tickets ----------


def parse_threads():
    tickets = []
    for path in sorted((BUILD / "threads").glob("*.txt")):
        ticket, event = None, None
        for raw in path.read_text().splitlines():
            line = raw.rstrip()
            if line.startswith("//"):
                continue
            if m := HEADER.match(line):
                ticket = parse_header(m.group(1))
                tickets.append(ticket)
                event = None
            elif (
                ticket is not None and "subject" not in ticket and line.startswith("# ")
            ):
                ticket["subject"] = line[2:].strip()
            elif (m := EVENT.match(line)) and (
                m.group(1) == "C" or m.group(2) in AGENT_KEYS
            ):
                kind, who, gap, text = m.groups()
                event = {"kind": kind, "who": who, "gap": gap, "lines": [text or ""]}
                ticket["events"].append(event)
            elif m := ASSIGN.match(line):
                ticket["events"].append(
                    {"kind": "@", "who": m.group(1), "gap": m.group(2)}
                )
                event = None
            elif event is not None:
                event["lines"].append(line)
            elif line.strip():
                raise ValueError(f"{path.name}: stray line {line!r}")
    return tickets


def parse_header(text):
    theme, who, priority, status, *rest = [p.strip() for p in text.split("|")]
    slug, contact = who.split("/")
    opts = {}
    for part in rest:
        key, _, value = part.partition("=")
        opts[key] = value if "=" in part else True
    return {
        "theme": theme,
        "slug": slug,
        "contact": contact,
        "priority": priority,
        "status": status,
        "events": [],
        "opts": opts,
    }


def place_in_time(tickets):
    """Pick an opening day for resolved tickets. Active ones are laid out backwards from T."""
    rng = random.Random(7)
    done = [t for t in tickets if t["status"] == "Done" and "at" not in t["opts"]]
    recent = [t for t in done if "v3" in t["opts"]]
    others = sorted(
        (t for t in done if "v3" not in t["opts"]), key=lambda t: t["subject"]
    )
    rng.shuffle(others)
    recent += others[:RECENT_DONE]
    old = others[RECENT_DONE:]
    for i, t in enumerate(sorted(recent, key=lambda t: t["subject"])):
        # spread over the days after the v3 release at T-7d, heavier early on
        t["day"] = 6.8 - 6.2 * ((i + rng.random()) / len(recent)) ** 1.6
    for i, t in enumerate(old):
        t["day"] = 7.6 + (60 - 7.6) * (i + rng.random()) / len(old)


def lay_out(t, plan, rng):
    """Minutes relative to T for every event, the first one being the ticket's creation."""
    gaps, first_agent = [], True
    for i, ev in enumerate(t["events"]):
        if i == 0:
            gaps.append(0)
        elif ev["gap"]:
            gaps.append(minutes(ev["gap"]))
        elif ev["kind"] == "A" and first_agent:
            gaps.append(rng.randint(*FIRST_REPLY_GAP[t["priority"]]))
        else:
            gaps.append(rng.randint(*GAP[ev["kind"]]))
        first_agent = first_agent and ev["kind"] != "A"
    opts = t["opts"]
    if "at" in opts:
        start = parse_offset(opts["at"])
    elif t["status"] in ("Open", "Replied"):
        replied = any(e["kind"] == "A" for e in t["events"])
        if t["status"] == "Open" and not replied:
            # unanswered: inside its first-response target, unless marked overdue
            target = SLA_HOURS[plan][t["priority"]][0] * 60
            last = -target * (
                rng.uniform(1.15, 1.6) if "overdue" in opts else rng.uniform(0.1, 0.85)
            )
        else:
            last = -rng.randint(
                *((30, 7000) if t["status"] == "Replied" else (8, 5000))
            )
        start = last - sum(gaps)
    else:
        start = -t["day"] * 1440
        room = -200 - start  # leave time to resolve and rate before T
        if sum(gaps) > room:
            gaps = [g * room / sum(gaps) for g in gaps]
    times, now = [], start
    for g in gaps:
        now += g
        times.append(now)
    return times


def render_ticket(t, orgs):
    theme, team, ticket_type = THEMES[t["theme"]]
    org = orgs[t["slug"]]
    contact = f"{t['contact']}@{org['slug']}.example"
    emails = {c["email"] for c in org["contacts"]}
    assert contact in emails, contact
    rng = random.Random(zlib.crc32(t["subject"].encode()))
    opts = t["opts"]
    times = lay_out(t, org["plan"], rng)
    first, *events = t["events"]
    assert first["kind"] == "C", t["subject"]

    thread, last_agent, handover = [], None, None
    owner = opts.get("to") or next((e["who"] for e in events if e["kind"] == "A"), None)
    owner = None if owner == "none" else owner
    for ev, at in zip(events, times[1:]):
        kind, who, text = ev["kind"], ev["who"], "\n".join(ev.get("lines", []))
        if kind == "C":
            sender = f"{who}@{org['slug']}.example" if who else contact
            assert sender in emails, sender
            thread.append(
                {
                    "at": at,
                    "type": "customer_reply",
                    "by": sender,
                    "content": html_blocks(text),
                }
            )
        elif kind == "A":
            last_agent = who
            thread.append(
                {
                    "at": at,
                    "type": "reply",
                    "by": agent_email(who),
                    "content": html_blocks(text),
                }
            )
        elif kind == "N":
            thread.append(
                {
                    "at": at,
                    "type": "comment",
                    "by": agent_email(who),
                    "content": mention_html(text),
                }
            )
        else:  # '@' hands the ticket over; only the final assignment is replayed
            owner, handover = who, (at, last_agent or "jamie")
    if owner:
        at, by = handover or (times[0] + rng.randint(1, 6), "jamie")
        thread.append(
            {
                "at": at,
                "type": "assign",
                "by": agent_email(by),
                "to": agent_email(owner),
            }
        )

    thread.sort(key=lambda e: e["at"])
    status = "Open"
    for ev in thread:
        status = {"reply": "Replied", "customer_reply": "Open"}.get(ev["type"], status)
    if t["status"] == "Done":
        end = times[-1] + rng.randint(5, 150)
        status = "Closed" if end < -10 * 1440 else "Resolved"
        thread.append(
            {
                "at": end,
                "type": "update",
                "by": agent_email(owner or "jamie"),
                "values": {"status": status},
            }
        )
        if "rate" in opts:
            values = {"feedback": FEEDBACK_OPTIONS[int(opts["rate"])]}
            if isinstance(opts.get("note"), str):
                values["feedback_extra"] = opts["note"].strip('"')
            thread.append(
                {
                    "at": min(end + rng.randint(20, 900), -5),
                    "type": "update",
                    "by": contact,
                    "values": values,
                }
            )
    else:
        assert status == t["status"], (t["subject"], status, t["status"])

    for ev in thread:
        ev["at"] = offset(ev["at"])
    ticket = {
        "doctype": "HD Ticket",
        "subject": t["subject"],
        "raised_by": contact,
        "customer": org["name"],
        "description": html_blocks("\n".join(first["lines"])),
        "priority": t["priority"],
        "ticket_type": opts.get("type", ticket_type),
        "agent_group": team,
        "via_customer_portal": int(bool(opts.get("portal")) or rng.random() < 0.35),
        "creation": offset(times[0]),
        "thread": thread,
        # fixture metadata, not HD Ticket fields: the insert ignores them
        "theme": theme,
        "plan": org["plan"],
        "final_status": status,
    }
    if "scene" in opts:
        ticket["scene"] = opts["scene"]
    if "response_by" in opts:
        ticket["response_by"] = opts["response_by"]
    return times[0], ticket


def build_tickets(orgs):
    raw = parse_threads()
    place_in_time(raw)
    by_slug = {o["slug"]: o for o in orgs}
    return [
        ticket
        for _start, ticket in sorted(
            (render_ticket(t, by_slug) for t in raw), key=lambda p: p[0]
        )
    ]


# ---------- knowledge base and saved replies ----------


def parse_sections(name):
    """'== a | b | c' header, then free text until the next header."""
    items, current = [], None
    for line in (BUILD / name).read_text().splitlines():
        if line.startswith("//"):
            continue
        if m := HEADER.match(line):
            current = {"meta": [p.strip() for p in m.group(1).split("|")], "lines": []}
            items.append(current)
        elif current is not None:
            current["lines"].append(line)
    return items


def build_kb():
    categories, articles = {}, []
    for item in parse_sections("kb.txt"):
        category, title, author, published = item["meta"]
        categories.setdefault(category, None)
        articles.append(
            {
                "doctype": "HD Article",
                "title": title,
                "category": category,
                "author": agent_email(author),
                "status": "Published",
                "published_on": published,
                "content": html_blocks("\n".join(item["lines"])),
                "views": zlib.crc32(title.encode()) % 900 + 40,
            }
        )
    return [
        {"doctype": "HD Article Category", "category_name": c} for c in categories
    ] + articles


def build_saved_replies():
    replies = []
    for item in parse_sections("saved_replies.txt"):
        title, scope, *teams = item["meta"]
        replies.append(
            {
                "doctype": "HD Saved Reply",
                "title": title,
                "scope": scope,
                "teams": [{"team": t} for t in teams if t],
                "message": html_blocks("\n".join(item["lines"])),
            }
        )
    return replies


def write(name, data):
    (FIXTURE / f"{name}.json").write_text(
        json.dumps(data, indent="\t", ensure_ascii=False) + "\n"
    )


def main():
    orgs = read_orgs()
    tickets = build_tickets(orgs)
    write(
        "meta",
        {
            "seed_version": SEED_VERSION,
            "personas": {
                "agent": agent_email("jamie"),
                "customer": "priya@greenleaf-studio.example",
            },
        },
    )
    write("sla", build_sla(orgs))
    write("agents", build_agents())
    write("customers", build_customers(orgs))
    write("contacts", build_contacts(orgs))
    write("kb", build_kb())
    write("saved_replies", build_saved_replies())
    write("tickets", tickets)
    print(f"{len(tickets)} tickets")


if __name__ == "__main__":
    main()
