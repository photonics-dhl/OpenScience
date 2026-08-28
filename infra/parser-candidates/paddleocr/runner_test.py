import importlib.util
import json
from pathlib import Path
import unittest


RUNNER_PATH = Path(__file__).with_name("runner.py")


def load_runner():
    if not RUNNER_PATH.is_file():
        raise AssertionError("PaddleOCR runner API is missing")
    spec = importlib.util.spec_from_file_location("paddleocr_candidate_runner", RUNNER_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("PaddleOCR runner API cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PaddleOcrRunnerTest(unittest.TestCase):
    def test_reproduces_scan_text_and_region_without_returning_content(self):
        runner = load_runner()
        pages = {
            1: {
                "width": 612,
                "height": 792,
                "items": [{"text": "PULSE 42 FS", "bbox": (72, 600, 432, 645)}],
            }
        }

        outcome = runner.evaluate_locators(
            pages,
            [
                {"kind": "page-text", "page": 1, "quote": "PULSE 42 FS"},
                {"kind": "page-region", "page": 1, "bbox": [72, 600, 432, 645]},
            ],
        )

        self.assertEqual(outcome, {"status": "succeeded", "locatorMatches": 2})
        self.assertNotIn("PULSE 42 FS", json.dumps(outcome))

    def test_marks_missed_scan_locators_for_review(self):
        runner = load_runner()

        outcome = runner.evaluate_locators(
            {1: {"width": 612, "height": 792, "items": []}},
            [{"kind": "page-text", "page": 1, "quote": "PULSE 42 FS"}],
        )

        self.assertEqual(
            outcome,
            {"status": "needs_review", "locatorMatches": 0, "errorCode": "locator_miss"},
        )


if __name__ == "__main__":
    unittest.main()
