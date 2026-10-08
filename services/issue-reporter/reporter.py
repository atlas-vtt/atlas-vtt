"""Fixed-repository issue creation, validation, durable deduplication and rate limits."""
from contextlib import closing
import hashlib
import hmac
import json
import re
import sqlite3
import time
from pathlib import Path

CATEGORY_FILE = Path(__file__).with_name("issueCategories.json")
if not CATEGORY_FILE.exists():
    CATEGORY_FILE = Path(__file__).parents[2] / "src/app/support/issueCategories.json"
CATEGORIES = json.loads(CATEGORY_FILE.read_text())
# A plugin may know an area this service's copy of the categories does not (a newer
# or older list). Such a report is filed under this area, never refused.
FALLBACK_AREA = "unknown"
FALLBACK_AREA_LABEL = CATEGORIES["ISSUE_AREAS"][FALLBACK_AREA]
CATEGORY_KEY = re.compile(r"[a-z][a-z-]{0,31}")
LIMITS = dict(title=120, description=30000, steps=10000, environment=10000, errors=10000)


class ReportError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def validate(report):
    if not isinstance(report, dict) or set(report) != {"type", "area", *LIMITS}:
        raise ReportError(400, "Invalid report fields.")
    if not isinstance(report["type"], str) or report["type"] not in CATEGORIES["ISSUE_TYPES"]:
        raise ReportError(400, "Choose a valid issue type.")
    if not isinstance(report["area"], str) or not CATEGORY_KEY.fullmatch(report["area"]):
        raise ReportError(400, "Choose a valid affected area.")
    for key, limit in LIMITS.items():
        if not isinstance(report[key], str) or len(report[key]) > limit:
            raise ReportError(400, f"The {key} field exceeds its {limit}-character limit.")
    if not report["title"].strip() or not report["description"].strip():
        raise ReportError(400, "Add a title and description.")


def area_of(report):
    """The label key and the text of the report's area, as this service knows it."""
    sent = report["area"]
    if sent in CATEGORIES["ISSUE_AREAS"]:
        return sent, CATEGORIES["ISSUE_AREAS"][sent]
    return FALLBACK_AREA, f'{FALLBACK_AREA_LABEL} (sent as "{sent}")'


def github_payload(report, request_id):
    feature = report["type"] == "feature"
    area, area_text = area_of(report)
    sections = [
        ("What kind of issue is this?", CATEGORIES["ISSUE_TYPES"][report["type"]]),
        ("Which part of Atlas is affected?", area_text),
        ("What would you like to do?" if feature else "What happened?", report["description"]),
        ("How could it work?" if feature else "Steps to reproduce", report["steps"]),
        ("Environment", report["environment"]),
        ("Recent errors", "" if feature else report["errors"]),
    ]
    # Neutralize mentions in user text to avoid an anonymous notification relay.
    body = "\n\n".join(f"### {heading}\n\n{text.strip()}" for heading, text in sections if text.strip())
    body = body.replace("@", "@\u200b")
    body += f"\n\n<!-- atlas-report:{request_id} -->\n"
    if len(body.encode("utf-8")) > 60000:
        raise ReportError(400, "The report is too long. Shorten the text or omit optional diagnostics.")
    return {
        "title": report["title"].strip().replace("@", "@\u200b"),
        "body": body,
        "labels": ["needs-triage", f"type:{report['type']}", f"area:{area}"],
    }


class Reporter:
    def __init__(self, database, create_issue, rate_key):
        self.database = database
        self.create_issue = create_issue
        self.rate_key = rate_key
        with closing(sqlite3.connect(database)) as db, db:
            db.execute("""CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY, digest TEXT NOT NULL, receipt TEXT, created REAL NOT NULL)""")
            db.execute("CREATE TABLE IF NOT EXISTS attempts (client TEXT, created REAL)")
            db.execute("CREATE INDEX IF NOT EXISTS attempts_time ON attempts(created)")

    def submit(self, request_id, report, client):
        if not isinstance(request_id, str) or not re.fullmatch(
                r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", request_id):
            raise ReportError(400, "Invalid request identifier.")
        validate(report)
        payload = github_payload(report, request_id)
        digest = hashlib.sha256(json.dumps(report, sort_keys=True).encode()).hexdigest()
        now = time.time()
        # IPs never persist; rotating daily pseudonyms limit retained identifiers.
        client_hash = hmac.new(self.rate_key, f"{int(now // 86400)}:{client}".encode(), hashlib.sha256).hexdigest()
        with closing(sqlite3.connect(self.database, timeout=5)) as db, db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT digest, receipt FROM reports WHERE id=?", (request_id,)).fetchone()
            if previous:
                if previous[0] != digest:
                    raise ReportError(409, "This request identifier belongs to another report.")
                if previous[1]:
                    return json.loads(previous[1])
                raise ReportError(503, "Delivery is awaiting confirmation. Keep this report and retry later.")
            db.execute("DELETE FROM attempts WHERE created < ?", (now - 86400,))
            per_client = db.execute("SELECT COUNT(*) FROM attempts WHERE client=? AND created>?",
                                    (client_hash, now - 3600)).fetchone()[0]
            global_count = db.execute("SELECT COUNT(*) FROM attempts").fetchone()[0]
            if per_client >= 3 or global_count >= 100:
                raise ReportError(429, "The reporting limit has been reached. Please try again later.")
            db.execute("INSERT INTO attempts VALUES (?, ?)", (client_hash, now))
            db.execute("INSERT INTO reports VALUES (?, ?, NULL, ?)", (request_id, digest, now))
        try:
            receipt = self.create_issue(payload)
        except Exception:
            # An HTTP timeout can happen AFTER GitHub created the issue. Never repost
            # automatically. The marker above lets the operator reconcile a pending row.
            raise ReportError(503, "Delivery could not be confirmed. Keep this report and retry later.") from None
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE reports SET receipt=? WHERE id=?", (json.dumps(receipt), request_id))
        return receipt
