import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from reporter import Reporter, ReportError

REPORT = dict(type="crash", area="vision", title="Fog freezes", description="Fog freezes on reveal",
              steps="Reveal fog", environment="Atlas: 0.2.0", errors="Renderer failed")
KEY = "db305e49-f8d5-481d-908f-aaafcc428f03"
RECEIPT = dict(number=42, url="https://github.com/atlas-vtt/atlas-vtt/issues/42")

class Reports(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "reports.sqlite"
        self.create = Mock(return_value=RECEIPT)
        self.reporter = Reporter(self.db, self.create, b"test-only-rate-limit-key")

    def tearDown(self):
        self.tmp.cleanup()

    def test_preserves_categories_and_all_text_in_github_payload(self):
        self.assertEqual(self.reporter.submit(KEY, REPORT, "1.2.3.4"), RECEIPT)
        payload = self.create.call_args.args[0]
        self.assertEqual(payload["labels"], ["needs-triage", "type:crash", "area:vision"])
        self.assertIn("Crash or freeze", payload["body"])
        self.assertIn("Fog of war and lighting", payload["body"])
        self.assertIn(REPORT["description"], payload["body"])
        self.assertIn(REPORT["environment"], payload["body"])

    def test_area_this_service_does_not_list_is_filed_as_unknown(self):
        self.assertEqual(self.reporter.submit(KEY, {**REPORT, "area": "newer-area"}, "1.2.3.4"), RECEIPT)
        payload = self.create.call_args.args[0]
        self.assertEqual(payload["labels"], ["needs-triage", "type:crash", "area:unknown"])
        self.assertIn('Not sure / other (sent as "newer-area")', payload["body"])

    def test_every_area_of_the_shared_list_keeps_its_label(self):
        import uuid
        from reporter import CATEGORIES, github_payload
        for area, text in CATEGORIES["ISSUE_AREAS"].items():
            payload = github_payload({**REPORT, "area": area}, str(uuid.uuid4()))
            self.assertIn(f"area:{area}", payload["labels"])
            self.assertIn(text, payload["body"])
            self.assertNotIn("sent as", payload["body"])

    def test_duplicate_survives_process_restart(self):
        self.reporter.submit(KEY, REPORT, "1.2.3.4")
        restarted = Reporter(self.db, self.create, b"test-only-rate-limit-key")
        self.assertEqual(restarted.submit(KEY, REPORT, "1.2.3.4"), RECEIPT)
        self.assertEqual(self.create.call_count, 1)

    def test_changed_payload_cannot_reuse_request_id(self):
        self.reporter.submit(KEY, REPORT, "1.2.3.4")
        with self.assertRaises(ReportError) as error:
            self.reporter.submit(KEY, {**REPORT, "title": "Different"}, "1.2.3.4")
        self.assertEqual(error.exception.status, 409)

    def test_invalid_categories_and_oversize_are_rejected_before_github(self):
        for changed in (dict(area="__proto__"), dict(area="Maps"), dict(area="a" * 33), dict(area=""),
                        dict(area=["maps"]), dict(area="maps\narea:other"), dict(type="invalid"),
                        dict(title=" "), dict(description="x"*30001), dict(title=1), dict(repo="other/repo")):
            with self.assertRaises(ReportError):
                self.reporter.submit(KEY, {**REPORT, **changed}, "1.2.3.4")
        self.create.assert_not_called()

    def test_uncertain_github_response_is_not_posted_twice(self):
        self.create.side_effect = TimeoutError()
        for _ in range(2):
            with self.assertRaises(ReportError) as error:
                self.reporter.submit(KEY, REPORT, "1.2.3.4")
            self.assertEqual(error.exception.status, 503)
        self.assertEqual(self.create.call_count, 1)

    def test_rate_limit_and_no_raw_ip_or_report_in_database(self):
        import uuid
        for _ in range(3):
            self.reporter.submit(str(uuid.uuid4()), REPORT, "1.2.3.4")
        with self.assertRaises(ReportError) as error:
            self.reporter.submit(str(uuid.uuid4()), REPORT, "1.2.3.4")
        self.assertEqual(error.exception.status, 429)
        data = self.db.read_bytes()
        self.assertNotIn(b"1.2.3.4", data)
        self.assertNotIn(b"Fog freezes on reveal", data)

    def test_feature_omits_errors(self):
        self.reporter.submit(KEY, {**REPORT, "type": "feature"}, "1.2.3.4")
        payload = self.create.call_args.args[0]
        self.assertNotIn("Renderer failed", payload["body"])
        self.assertIn("type:feature", payload["labels"])

if __name__ == "__main__":
    unittest.main()
