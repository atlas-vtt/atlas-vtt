import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import Mock
from server import Handler, Server, allowed_origins

class HttpReports(unittest.TestCase):
    def setUp(self):
        self.server = Server(("127.0.0.1", 0), Handler)
        self.server.reporter = Mock()
        self.server.reporter.submit.return_value = dict(number=42, url="https://github.com/atlas-vtt/atlas-vtt/issues/42")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def post(self, body, **headers):
        return urlopen(Request(self.url + "/atlas/reports", data=body, method="POST",
                              headers={"Content-Type": "application/json", **headers}))

    def test_submits_and_returns_receipt(self):
        with self.post(json.dumps(dict(requestId="id", report={})).encode(), **{"X-Forwarded-For": "1.1.1.1, 192.0.2.1"}) as response:
            self.assertEqual(response.status, 201)
            self.assertEqual(json.load(response)["number"], 42)
        self.server.reporter.submit.assert_called_once_with("id", {}, "192.0.2.1")

    def test_rejects_no_proxy_address_and_invalid_json(self):
        for body, headers in [(b"{}", {}), (b"invalid", {"X-Forwarded-For": "192.0.2.1"})]:
            with self.assertRaises(HTTPError) as error:
                self.post(body, **headers)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
        self.server.reporter.submit.assert_not_called()

    def test_rejects_large_request(self):
        with self.assertRaises(HTTPError) as error:
            self.post(b"x"*180001)
        self.assertEqual(error.exception.code, 413)
        error.exception.close()


PAGE = "https://reports.example"


class BrowserPages(unittest.TestCase):
    """Pages on a listed origin may submit from a browser; every other origin gets no CORS answer."""

    def setUp(self):
        self.server = Server(("127.0.0.1", 0), Handler)
        self.server.origins = allowed_origins(f" {PAGE} , ,https://other.example")
        self.server.reporter = Mock()
        self.server.reporter.submit.return_value = dict(number=42, url="https://github.com/atlas-vtt/atlas-vtt/issues/42")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/atlas/reports"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def send(self, method, body=None, **headers):
        try:
            return urlopen(Request(self.url, data=body, method=method, headers=headers))
        except HTTPError as error:
            return error

    def test_reads_listed_origins_exactly(self):
        self.assertEqual(allowed_origins(""), frozenset())
        self.assertEqual(self.server.origins, {PAGE, "https://other.example"})

    def test_answers_a_listed_page_before_and_after_it_posts(self):
        with self.send("OPTIONS", Origin=PAGE, **{"Access-Control-Request-Method": "POST",
                                                  "Access-Control-Request-Headers": "content-type"}) as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], PAGE)
            self.assertEqual(response.headers["Access-Control-Allow-Methods"], "POST")
            self.assertEqual(response.headers["Access-Control-Allow-Headers"], "Content-Type")
            self.assertEqual(response.headers["Vary"], "Origin")
        body = json.dumps(dict(requestId="id", report={})).encode()
        with self.send("POST", body, Origin=PAGE, **{"Content-Type": "application/json", "X-Forwarded-For": "192.0.2.1"}) as response:
            self.assertEqual(response.status, 201)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], PAGE)
        self.server.reporter.submit.assert_called_once_with("id", {}, "192.0.2.1")

    def test_a_listed_page_reads_refusals_too(self):
        with self.send("POST", b"invalid", Origin=PAGE, **{"Content-Type": "application/json", "X-Forwarded-For": "192.0.2.1"}) as response:
            self.assertEqual(response.status, 400)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], PAGE)

    def test_refuses_other_origins_and_requests(self):
        for headers, path in [({"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"}, "/atlas/reports"),
                              ({"Access-Control-Request-Method": "POST"}, "/atlas/reports"),
                              ({"Origin": PAGE, "Access-Control-Request-Method": "GET"}, "/atlas/reports"),
                              ({"Origin": PAGE, "Access-Control-Request-Method": "POST"}, "/health")]:
            self.url = f"http://127.0.0.1:{self.server.server_port}{path}"
            with self.send("OPTIONS", **headers) as response:
                self.assertEqual(response.status, 403)
                self.assertIsNone(response.headers["Access-Control-Allow-Origin"])
        self.url = f"http://127.0.0.1:{self.server.server_port}/atlas/reports"
        body = json.dumps(dict(requestId="id", report={})).encode()
        with self.send("POST", body, Origin="https://evil.example", **{"Content-Type": "application/json", "X-Forwarded-For": "192.0.2.1"}) as response:
            self.assertEqual(response.status, 201)
            self.assertIsNone(response.headers["Access-Control-Allow-Origin"])

    def test_without_listed_origins_answers_as_before(self):
        self.server.origins = frozenset()
        body = json.dumps(dict(requestId="id", report={})).encode()
        with self.send("POST", body, Origin=PAGE, **{"Content-Type": "application/json", "X-Forwarded-For": "192.0.2.1"}) as response:
            self.assertEqual(response.status, 201)
            self.assertIsNone(response.headers["Access-Control-Allow-Origin"])
            self.assertIsNone(response.headers["Vary"])


if __name__ == "__main__":
    unittest.main()
