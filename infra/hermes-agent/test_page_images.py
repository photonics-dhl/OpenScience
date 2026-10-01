import json
from types import SimpleNamespace
import unittest
from task_agent import NativeTaskStopped, append_bound_page_images


def view(call_id):
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name="paper_view", arguments='{"pages":[2]}'))


class PageImageTests(unittest.TestCase):
    def test_binds_successful_native_results_by_call_id_instead_of_concurrent_order(self):
        output = json.dumps({"status": "page_view_ready", "pages": [2]})
        results = [{"role": "tool", "tool_call_id": key, "content": output} for key in ["second", "first"]]
        calls = []
        def images(call_id, args, result):
            calls.append((call_id, args, result))
            return [{"type": "text", "text": f"Bound page for {call_id}"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,fixture"}}]
        history = list(results)
        append_bound_page_images([view("first"), view("second")], results, history, images)
        self.assertEqual([v[0] for v in calls], ["first", "second"])
        self.assertEqual(history[-1]["role"], "user")
        self.assertEqual(len([p for p in history[-1]["content"] if p["type"] == "image_url"]), 2)
        self.assertEqual(history[:2], results)

    def test_does_not_add_pixels_for_failed_missing_or_foreign_tool_result(self):
        def forbidden(*_args):
            self.fail("Unsuccessful read released pixels")
        for content, key in [(json.dumps({"status": "failed"}), "first"), ("not json", "first"),
                             (json.dumps({"status": "page_view_ready"}), "foreign")]:
            history = [{"role": "tool", "tool_call_id": key, "content": content}]
            append_bound_page_images([view("first")], list(history), history, forbidden)
            self.assertEqual(len(history), 1)

    def test_revocation_before_pixel_release_stops_without_extra_user_message(self):
        history = [{"role": "tool", "tool_call_id": "first", "content": '{"status":"page_view_ready"}'}]
        def revoked(*_args):
            raise NativeTaskStopped("revoked")
        with self.assertRaises(NativeTaskStopped):
            append_bound_page_images([view("first")], list(history), history, revoked)
        self.assertEqual(len(history), 1)


if __name__ == "__main__":
    unittest.main()
