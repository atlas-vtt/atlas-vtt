"""HTTP adapter with a loopback-only host port. Put the documented HTTPS reverse proxy in front."""
import ipaddress
import json
import os
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from reporter import Reporter, ReportError

REPOSITORY = "atlas-vtt/atlas-vtt"
# Atlas 0.5.1 and older accept only receipts under the repository's former owner,
# whose issue URLs GitHub redirects. Switch once those versions are gone.
RECEIPT_REPOSITORY = "ByteMirror/atlas-vtt"
MAX_BODY = 180000
REPORTS_PATH = "/atlas/reports"


def allowed_origins(value):
    """Exact origins (scheme, host and port) of web pages that may submit reports from a browser."""
    return frozenset(origin.strip() for origin in value.split(",") if origin.strip())


def github_create(payload):
    credential_dir = Path(os.environ["CREDENTIALS_DIRECTORY"])
    token = (credential_dir / "github-token").read_text().strip()
    request = Request(f"https://api.github.com/repos/{REPOSITORY}/issues",
                      data=json.dumps(payload).encode(), method="POST", headers={
                          "Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                          "Content-Type": "application/json", "User-Agent": "Atlas-issue-reporter",
                          "X-GitHub-Api-Version": "2022-11-28"})
    with urlopen(request, timeout=20) as response:
        issue = json.load(response)
    number = issue.get("number")
    if not isinstance(number, int) or number < 1:
        raise ValueError("Invalid issue receipt")
    return {"number": number, "url": f"https://github.com/{RECEIPT_REPOSITORY}/issues/{number}"}


class Server(ThreadingHTTPServer):
    daemon_threads = True
    # Browsers may read answers only on these pages; other clients send no Origin and need none.
    origins = frozenset()
    slots = threading.BoundedSemaphore(16)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "AtlasReporter"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(25)

    def log_message(self, *_):
        pass  # No IPs, report contents, credentials or request paths in access logs.

    def page_origin(self):
        """The request's Origin when it is a page allowed to submit reports, else None."""
        origin = self.headers.get("Origin")
        return origin if origin in self.server.origins else None

    def send_origin(self):
        if not self.server.origins:
            return
        self.send_header("Vary", "Origin")
        origin = self.page_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)

    def reply(self, status, body, cors=True):
        data = json.dumps(body).encode()
        self.send_response(status)
        if cors:
            self.send_origin()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, {"status": "ok"})
        else:
            self.reply(404, {"error": "Not found."})

    def do_OPTIONS(self):
        # A browser asks before it posts JSON from another origin. Only listed pages get a yes.
        if (self.path != REPORTS_PATH or self.page_origin() is None
                or self.headers.get("Access-Control-Request-Method") != "POST"):
            self.reply(403, {"error": "Not allowed."}, cors=False)
            return
        self.send_response(204)
        self.send_origin()
        self.send_header("Access-Control-Allow-Methods", "POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        try:
            if self.path != REPORTS_PATH:
                raise ReportError(404, "Not found.")
            if self.headers.get("Transfer-Encoding") or self.headers.get_content_type() != "application/json":
                raise ReportError(400, "Expected a JSON report.")
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise ReportError(413, "The report is too large.")
            # Traefik appends the actual peer as the rightmost address. Ignore
            # any client-supplied prefix. The host port is loopback-only.
            client = self.headers.get("X-Forwarded-For", "").split(",")[-1].strip()
            try:
                address = ipaddress.ip_address(client)
                if address.version == 6:
                    client = str(ipaddress.ip_network(f"{address}/64", strict=False))
                else:
                    client = str(address)
            except ValueError:
                raise ReportError(400, "Missing client address.") from None
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict) or set(request) != {"requestId", "report"}:
                raise ReportError(400, "Invalid request.")
            receipt = self.server.reporter.submit(request["requestId"], request["report"], client)
            self.reply(201, receipt)
        except ReportError as error:
            self.reply(error.status, {"error": str(error)})
        except (ValueError, UnicodeError):
            self.reply(400, {"error": "Invalid JSON report."})
        except Exception:
            self.reply(503, {"error": "Reporting is temporarily unavailable. Please try again later."})


def main():
    state = Path(os.environ.get("STATE_DIRECTORY", "/var/lib/atlas-issue-reporter"))
    state.mkdir(parents=True, exist_ok=True)
    rate_key = state / "rate-key"
    if not rate_key.exists():
        with rate_key.open("xb") as output:
            output.write(secrets.token_bytes(32))
        rate_key.chmod(0o600)
    server = Server((os.environ.get("LISTEN_HOST", "127.0.0.1"), 8790), Handler)
    server.origins = allowed_origins(os.environ.get("ATLAS_REPORT_ORIGINS", ""))
    server.reporter = Reporter(state / "reports.sqlite", github_create, rate_key.read_bytes())
    server.serve_forever()


if __name__ == "__main__":
    main()
