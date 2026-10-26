"""Check the Fernbill fixture against the replay contract and the content rules.

Run: python3 helpdesk/demo/fixture/_build/validate.py
Exits non-zero and lists every problem found. Stdlib only.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

FIXTURE = Path(__file__).parent.parent
ASSETS = "/assets/helpdesk/demo/"
PUBLIC_DEMO = FIXTURE.parents[1] / "public" / "demo"
ENTITIES = ("sla", "agents", "customers", "contacts", "kb", "saved_replies", "tickets")
DOCTYPES = {
    "sla": {"HD Service Level Agreement"},
    "agents": {"User", "HD Agent", "HD Team"},
    "customers": {"HD Customer"},
    "contacts": {"Contact", "User"},
    "kb": {"HD Article Category", "HD Article"},
    "saved_replies": {"HD Saved Reply"},
    "tickets": {"HD Ticket"},
}
OFFSET = re.compile(r"^T(?:([+-])((?:\d+[dhms])+))?$")
UNIT_MINUTES = {"d": 1440, "h": 60, "m": 1, "s": 1 / 60}
TIME_FIELDS = {"creation", "published_on", "response_by", "resolution_by", "at"}
EVENT_KEYS = {
    "reply": "content",
    "customer_reply": "content",
    "comment": "content",
    "assign": "to",
    "update": "values",
}
PRIORITIES = {"Urgent", "High", "Medium", "Low"}
TICKET_TYPES = {"Question", "Bug", "Incident", "Unspecified"}
STATUSES = {"Open", "Replied", "Resolved", "Closed"}
FEEDBACK = {
    "Response did not help": 1,
    "No resolution provided": 1,
    "Delayed response time": 2,
    "Adequate help, bit slow": 2,
    "Clear guidance given": 3,
    "Helpful answers, reasonable wait": 3,
    "Quick and precise solutions": 4,
    "Prompt, informative support": 4,
    "Exceptional support experience": 5,
    "Instant, top-notch help": 5,
}
THEME_MIX = {
    "Billing": 70,
    "Integrations": 40,
    "Bugs": 30,
    "How-to": 30,
    "Account/SSO": 20,
    "Feature requests": 10,
}
KB_MIX = {
    "Getting started": 4,
    "Invoicing": 6,
    "Payments": 5,
    "Integrations": 4,
    "Plans & billing": 3,
    "Account & security": 3,
}
PLAN_MIX = {"Enterprise": 5, "Growth": 15, "Starter": 20}
BANNED = [
    "—",
    "lorem ipsum",
    "delve",
    "seamless",
    "finds you well",
    "I hope this helps!",
]
MAX_EXCLAMATIONS = 5
SCENES = {
    "sla-breach": "Card payments failing for all our customers since this morning",
    "saved-reply": "How do I download past invoices?",
    "refund-approval": "Refund for a double charge",
    "kb-gap": "Can I invoice in euros?",
    "portal-awaiting": None,
    "portal-replied": None,
    "portal-resolved": None,
}

problems = []


def check(ok, message):
    if not ok:
        problems.append(message)
    return ok


def minutes(value):
    sign, parts = OFFSET.match(value).groups()
    total = sum(
        int(n) * UNIT_MINUTES[u] for n, u in re.findall(r"(\d+)([dhms])", parts or "")
    )
    return -total if sign == "-" else total


def walk_offsets(node, where):
    """Every time field is a valid offset; return nothing, record problems."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key in TIME_FIELDS and value is not None:
                check(
                    isinstance(value, str) and OFFSET.match(value),
                    f"{where}: bad offset {key}={value!r}",
                )
            walk_offsets(value, where)
    elif isinstance(node, list):
        for item in node:
            walk_offsets(item, where)


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from strings(value)
    elif isinstance(node, list):
        for item in node:
            yield from strings(item)


def text(html):
    return re.sub(r"<[^>]+>", " ", html)


def main():
    meta = json.loads((FIXTURE / "meta.json").read_text())
    data = {
        name: json.loads((FIXTURE / f"{name}.json").read_text()) for name in ENTITIES
    }
    docs = {
        name: Counter(d.get("doctype") for d in records)
        for name, records in data.items()
    }

    # contract shape
    check(
        isinstance(meta.get("seed_version"), str) and meta["seed_version"],
        "meta.seed_version must be a non-empty string",
    )
    for name, records in data.items():
        check(isinstance(records, list), f"{name}.json must be a list")
        for i, record in enumerate(records):
            check(
                record.get("doctype") in DOCTYPES[name],
                f"{name}.json[{i}]: doctype {record.get('doctype')!r} not allowed here",
            )
            walk_offsets(record, f"{name}.json[{i}]")

    def by_type(name, doctype):
        return [d for d in data[name] if d["doctype"] == doctype]

    agent_users = {u["email"] for u in by_type("agents", "User")}
    contact_users = {u["email"] for u in by_type("contacts", "User")}
    teams = {t["team_name"]: t for t in by_type("agents", "HD Team")}
    customers = {c["customer_name"] for c in data["customers"]}
    contacts = {}
    for c in by_type("contacts", "Contact"):
        email = c["email_ids"][0]["email_id"]
        contacts[email] = c["links"][0]["link_name"]
        check(
            c["links"][0]["link_name"] in customers,
            f"contact {email}: unknown customer",
        )
        check(email.endswith(".example"), f"contact {email}: not an .example address")
    for c in data["contacts"]:
        url = c.get("image") or c.get("user_image") or ""
        check(
            url.startswith(f"{ASSETS}customers/"),
            f"{c['doctype']} {c.get('email') or c['email_ids'][0]['email_id']}: no avatar",
        )
    check(
        set(contacts) == contact_users,
        "every Contact needs a matching Website User and the other way round",
    )
    check(len(customers) == 40, f"expected 40 customers, got {len(customers)}")
    check(
        all(e.endswith("@fernbill.example") for e in agent_users),
        "agents must use @fernbill.example",
    )
    check(
        len(by_type("agents", "HD Agent")) == 6 and len(teams) == 3,
        "expected 6 agents in 3 teams",
    )
    for a in by_type("agents", "HD Agent"):
        check(a["user"] in agent_users, f"HD Agent {a['user']} has no User")
    for t in teams.values():
        check(
            all(u["user"] in agent_users for u in t["users"]),
            f"team {t['team_name']}: member is not an agent",
        )
    check(
        meta["personas"]["agent"] in agent_users, "agent persona must be an agent User"
    )
    check(
        meta["personas"]["customer"] in contact_users,
        "customer persona must be a contact User",
    )

    # SLA: every customer resolves to one plan
    plans = {}
    for sla in data["sla"]:
        names = re.findall(r'"([^"]+)"', sla.get("condition") or "")
        for name in names:
            check(
                name in customers,
                f"SLA {sla['service_level']}: unknown customer {name}",
            )
            plans[name] = sla["service_level"]
        check(
            {p["priority"] for p in sla["priorities"]} == PRIORITIES,
            f"SLA {sla['service_level']}: needs all four priorities",
        )
    default = [s["service_level"] for s in data["sla"] if s.get("default_sla")]
    check(len(default) == 1, "exactly one default SLA")
    for c in customers - set(plans):
        plans[c] = default[0]
    check(
        Counter(plans.values()) == Counter(PLAN_MIX),
        f"plan mix {dict(Counter(plans.values()))} != {PLAN_MIX}",
    )
    enterprise_urgent = next(
        p
        for s in data["sla"]
        if s["service_level"] == "Enterprise"
        for p in s["priorities"]
        if p["priority"] == "Urgent"
    )
    check(
        enterprise_urgent["response_time"] == 3600
        and enterprise_urgent["resolution_time"] == 8 * 3600,
        "Enterprise Urgent must be 1h / 8h",
    )

    # knowledge base and saved replies
    categories = {c["category_name"] for c in by_type("kb", "HD Article Category")}
    articles = by_type("kb", "HD Article")
    check(
        Counter(a["category"] for a in articles) == Counter(KB_MIX),
        f"KB mix {dict(Counter(a['category'] for a in articles))}",
    )
    for a in articles:
        check(a["category"] in categories, f"article {a['title']}: unknown category")
        check(
            a["author"] in agent_users, f"article {a['title']}: author is not an agent"
        )
        check(
            not re.search(
                r"currenc|euro|multi-curr", text(a["content"]) + a["title"], re.I
            ),
            f"article {a['title']} covers multi-currency, which must stay a KB gap",
        )
    replies = {r["title"]: r for r in data["saved_replies"]}
    check("Download invoices" in replies, 'saved reply "Download invoices" is missing')
    for r in data["saved_replies"]:
        check(
            all(t["team"] in teams for t in r["teams"]),
            f"saved reply {r['title']}: unknown team",
        )

    # tickets
    tickets = data["tickets"]
    check(len(tickets) == 200, f"expected 200 tickets, got {len(tickets)}")
    statuses, ratings, themes, opened, jamie = Counter(), [], Counter(), [], 0
    for t in tickets:
        where = f"ticket {t['subject']!r}"
        check(
            t["raised_by"] in contacts and contacts[t["raised_by"]] == t["customer"],
            f"{where}: raised_by is not a contact of {t['customer']}",
        )
        check(
            t["priority"] in PRIORITIES and t["ticket_type"] in TICKET_TYPES,
            f"{where}: bad priority or type",
        )
        check(t["agent_group"] in teams, f"{where}: unknown team")
        check(t.get("description"), f"{where}: no description")
        created = minutes(t["creation"])
        check(created <= 0, f"{where}: created after T")
        previous, status, assignee = created, "Open", None
        for ev in t["thread"]:
            at = minutes(ev["at"])
            check(
                previous <= at <= 0,
                f"{where}: event at {ev['at']} out of order or after T",
            )
            previous = at
            kind = ev["type"]
            if not check(
                kind in EVENT_KEYS and EVENT_KEYS[kind] in ev and ev.get("by"),
                f"{where}: bad event {ev}",
            ):
                continue
            if kind in ("reply", "comment"):
                check(
                    ev["by"] in agent_users, f"{where}: {kind} by non-agent {ev['by']}"
                )
            if kind == "customer_reply":
                check(
                    contacts.get(ev["by"]) == t["customer"],
                    f"{where}: customer_reply by {ev['by']}",
                )
            if kind == "assign":
                check(ev["to"] in agent_users, f"{where}: assigned to non-agent")
                assignee = ev["to"]
            if kind == "update":
                check(
                    set(ev["values"]) <= {"status", "feedback", "feedback_extra"},
                    f"{where}: update sets {set(ev['values'])}",
                )
                if "feedback" in ev["values"]:
                    check(
                        ev["values"]["feedback"] in FEEDBACK,
                        f"{where}: unknown feedback option",
                    )
                    ratings.append(FEEDBACK.get(ev["values"]["feedback"], 0))
                status = ev["values"].get("status", status)
            status = {"reply": "Replied", "customer_reply": "Open"}.get(kind, status)
        check(
            status in STATUSES and status == t.get("final_status"),
            f"{where}: thread ends {status}, final_status {t.get('final_status')}",
        )
        statuses[status] += 1
        themes[t.get("theme")] += 1
        opened.append(created)
        jamie += assignee == meta["personas"]["agent"]
    check(abs(len(tickets) - 200) == 0, "ticket count")
    check(
        20 <= statuses["Open"] <= 30 and 25 <= statuses["Replied"] <= 35,
        f"status mix {dict(statuses)}",
    )
    check(
        all(abs(themes[k] - v) <= 2 for k, v in THEME_MIX.items()),
        f"theme mix {dict(themes)}",
    )
    average = sum(ratings) / len(ratings) if ratings else 0
    check(4.3 <= average <= 4.5, f"CSAT average {average:.2f} not about 4.4")
    check(7 <= jamie <= 9, f"{jamie} tickets assigned to Jamie, expected about 8")
    recent = sum(1 for m in opened if m > -7 * 1440) / 7
    before = sum(1 for m in opened if m <= -7 * 1440) / 53
    check(
        recent >= 2 * before, f"no spike after v3: {recent:.1f}/day vs {before:.1f}/day"
    )
    check(min(opened) >= -60 * 1440, "tickets older than 60 days")

    # scene tickets
    scenes = {t["scene"]: t for t in tickets if "scene" in t}
    for scene, subject in SCENES.items():
        if check(scene in scenes, f"scene {scene} missing") and subject:
            check(
                scenes[scene]["subject"] == subject,
                f"scene {scene}: subject {scenes[scene]['subject']!r}",
            )
    if "sla-breach" in scenes:
        t = scenes["sla-breach"]
        check(
            t["customer"] == "Northpeak Logistics" and t["priority"] == "Urgent",
            "Northpeak scene: customer/priority",
        )
        check(plans.get(t["customer"]) == "Enterprise", "Northpeak must be Enterprise")
        check(t.get("response_by") == "T+30m", "Northpeak response_by must be T+30m")
        check(
            minutes(t["creation"]) == -30,
            "Northpeak opens at T-30m so the 1h target lands on T+30m",
        )
        check(
            not any(e["type"] == "reply" for e in t["thread"]),
            "Northpeak must have no agent reply yet",
        )
    if "refund-approval" in scenes:
        comments = [
            text(e["content"])
            for e in scenes["refund-approval"]["thread"]
            if e["type"] == "comment"
        ]
        check(
            any("Jamie Rivera" in c and "$240" in c for c in comments),
            "refund scene: Ananya's comment must @mention Jamie about $240",
        )
    priya = meta["personas"]["customer"]
    portal = sorted(t["final_status"] for t in tickets if t["raised_by"] == priya)
    check(
        portal == ["Open", "Replied", "Resolved"],
        f"Priya's tickets {portal}, expected Open, Replied, Resolved",
    )
    resolved = [
        t
        for t in tickets
        if t["raised_by"] == priya and t["final_status"] == "Resolved"
    ]
    check(
        resolved
        and any("feedback" in e.get("values", {}) for e in resolved[0]["thread"]),
        "Priya's resolved ticket needs a CSAT rating",
    )

    # copy rules
    everything = [s for name in ENTITIES for s in strings(data[name])]
    for url in {s for s in everything if s.startswith(ASSETS)}:
        check(
            (PUBLIC_DEMO / url.removeprefix(ASSETS)).is_file(),
            f"{url} has no file in helpdesk/public/demo",
        )
    for phrase in BANNED:
        hits = [s for s in everything if phrase.lower() in s.lower()]
        check(not hits, f"banned {phrase!r} found {len(hits)} times")
    bangs = sum(text(s).count("!") for s in everything)
    check(
        bangs <= MAX_EXCLAMATIONS,
        f"{bangs} exclamation marks, cap is {MAX_EXCLAMATIONS}",
    )

    print(f"tickets {len(tickets)} | status {dict(statuses)} | themes {dict(themes)}")
    print(
        f"CSAT {len(ratings)} ratings, average {average:.2f} | Jamie {jamie} | per day last 7 {recent:.1f} vs before {before:.1f}"
    )
    print(
        f"customers {len(customers)} {dict(Counter(plans.values()))} | contacts {len(contacts)} | articles {len(articles)} | saved replies {len(replies)} | exclamations {bangs}"
    )
    for p in problems:
        print("FAIL", p)
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
