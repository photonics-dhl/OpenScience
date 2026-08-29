import importlib.util
import json
from pathlib import Path
import unittest


RUNNER_PATH = Path(__file__).with_name("runner.py")


def load_runner():
    if not RUNNER_PATH.is_file():
        raise AssertionError("Docling runner API is missing")
    spec = importlib.util.spec_from_file_location("docling_candidate_runner", RUNNER_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Docling runner API cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DoclingRunnerTest(unittest.TestCase):
    def test_normalizes_bottom_left_and_top_left_boxes(self):
        runner = load_runner()

        self.assertEqual(
            runner.bbox_to_top_left(
                {"l": 72, "t": 192, "r": 132, "b": 168, "coord_origin": "BOTTOMLEFT"},
                792,
            ),
            (72.0, 600.0, 132.0, 624.0),
        )
        self.assertEqual(
            runner.bbox_to_top_left(
                {"l": 10, "t": 20, "r": 30, "b": 50, "coord_origin": "TOPLEFT"},
                792,
            ),
            (10.0, 20.0, 30.0, 50.0),
        )

    def test_reproduces_text_order_and_region_locators_without_returning_content(self):
        runner = load_runner()
        pages = {
            1: {
                "width": 612,
                "height": 792,
                "items": [
                    {"text": "Left claim: reproducible pulse.", "bbox": (54, 60, 250, 78)},
                    {"text": "Right evidence: calibrated trace.", "bbox": (320, 60, 560, 78)},
                ],
            }
        }
        locators = [
            {
                "kind": "page-text-order",
                "page": 1,
                "quotes": ["Left claim: reproducible pulse.", "Right evidence: calibrated trace."],
            },
            {
                "kind": "page-region-text",
                "page": 1,
                "bbox": [0, 0, 306, 792],
                "quote": "Left claim: reproducible pulse.",
            },
            {
                "kind": "page-region-text",
                "page": 1,
                "bbox": [306, 0, 612, 792],
                "quote": "Right evidence: calibrated trace.",
            },
        ]

        outcome = runner.evaluate_locators(pages, locators)

        self.assertEqual(outcome, {"status": "succeeded", "locatorMatches": 3})
        self.assertNotIn("reproducible pulse", json.dumps(outcome))

    def test_marks_missing_or_geometry_free_locators_for_review(self):
        runner = load_runner()
        pages = {1: {"width": 612, "height": 792, "items": [{"text": "PULSE 42 FS", "bbox": None}]}}

        outcome = runner.evaluate_locators(
            pages,
            [
                {"kind": "page-text", "page": 1, "quote": "PULSE 42 FS"},
                {"kind": "page-region", "page": 1, "bbox": [72, 600, 432, 645]},
            ],
        )

        self.assertEqual(
            outcome,
            {"status": "needs_review", "locatorMatches": 1, "errorCode": "locator_miss"},
        )


if __name__ == "__main__":
    unittest.main()
