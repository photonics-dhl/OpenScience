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
    def test_normalizes_ndarray_boxes_and_flips_image_y_to_pdf_coordinates(self):
        runner = load_runner()

        class AmbiguousArray:
            def __init__(self, values):
                self.values = values

            def __bool__(self):
                raise ValueError("ambiguous ndarray truth")

            def tolist(self):
                return self.values

        class Image:
            shape = (792, 612, 3)

        pages = runner._pages_from_results([
            {
                "res": {
                    "page_index": 0,
                    "rec_texts": ["PULSE 42 FS"],
                    "rec_boxes": AmbiguousArray([[72, 147, 432, 192]]),
                },
                "input_img": Image(),
            }
        ])

        self.assertEqual(pages[1]["items"][0]["bbox"], (72, 600, 432, 645))
        self.assertEqual(
            runner.evaluate_locators(
                pages,
                [
                    {"kind": "page-text", "page": 1, "quote": "PULSE 42 FS"},
                    {"kind": "page-region", "page": 1, "bbox": [72, 600, 432, 645]},
                ],
            ),
            {"status": "succeeded", "locatorMatches": 2},
        )

    def test_rejects_invalid_and_oversized_ocr_boxes_before_locator_matching(self):
        runner = load_runner()

        class Image:
            shape = (792, 612, 3)

        invalid_boxes = [
            [-1, 147, 432, 192],
            [432, 147, 72, 192],
            [72, 147, 72, 192],
            [72, 192, 432, 147],
            [72, 147, 432, float("inf")],
            [0, 0, 613, 792],
        ]
        pages = runner._pages_from_results([
            {
                "res": {
                    "page_index": 0,
                    "rec_texts": ["INVALID"] * len(invalid_boxes),
                    "rec_boxes": invalid_boxes,
                },
                "input_img": Image(),
            }
        ])

        self.assertEqual(pages[1]["items"], [])
        self.assertEqual(
            runner.evaluate_locators(
                pages,
                [{"kind": "page-region", "page": 1, "bbox": [0, 0, 612, 792]}],
            ),
            {"status": "needs_review", "locatorMatches": 0, "errorCode": "locator_miss"},
        )

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

    def test_candidate_rss_uses_the_container_peak(self):
        runner = load_runner()

        self.assertEqual(
            runner._candidate_peak_rss_bytes(64_000_000, "123000000\n", True),
            123_000_000,
        )
        with self.assertRaisesRegex(ValueError, "container peak RSS"):
            runner._candidate_peak_rss_bytes(64_000_000, None, True)


if __name__ == "__main__":
    unittest.main()
