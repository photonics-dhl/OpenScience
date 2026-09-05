import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np


MODULE_PATH = Path(__file__).with_name("audition.py")


def load_audition_module():
    spec = importlib.util.spec_from_file_location("tts_audition", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AuditionOutputTest(unittest.TestCase):
    def test_phase_log_is_json_and_flushes_immediately(self):
        audition = load_audition_module()

        class FlushCountingStream(io.StringIO):
            flush_count = 0

            def flush(self):
                self.flush_count += 1
                super().flush()

        stream = FlushCountingStream()
        with redirect_stdout(stream):
            audition.log_phase("model_loaded", speaker="Serena", seconds=1.25)

        self.assertEqual(
            json.loads(stream.getvalue()),
            {"phase": "model_loaded", "speaker": "Serena", "seconds": 1.25},
        )
        self.assertGreaterEqual(stream.flush_count, 1)

    def test_saves_finite_nonzero_waveform_and_metrics_without_overwrite(self):
        audition = load_audition_module()
        waveform = np.array([0.0, 0.25, -0.25, 0.0], dtype=np.float32)

        def write_wave(path, samples, sample_rate, **_kwargs):
            self.assertEqual(sample_rate, 24_000)
            self.assertTrue(np.array_equal(samples, waveform))
            Path(path).write_bytes(b"RIFF-test-wave")

        with tempfile.TemporaryDirectory() as temporary_directory:
            output_root = Path(temporary_directory)
            metrics = {"schemaVersion": 1, "speaker": "Serena"}
            wav_path, metrics_path = audition.save_outputs(
                output_root,
                "Serena",
                waveform,
                24_000,
                metrics,
                write_wave,
            )

            self.assertEqual(wav_path.read_bytes(), b"RIFF-test-wave")
            self.assertEqual(json.loads(metrics_path.read_text(encoding="utf-8")), metrics)
            with self.assertRaisesRegex(FileExistsError, "refusing to overwrite"):
                audition.save_outputs(
                    output_root,
                    "Serena",
                    waveform,
                    24_000,
                    metrics,
                    write_wave,
                )

    def test_rejects_silent_or_nonfinite_waveforms(self):
        audition = load_audition_module()

        with self.assertRaisesRegex(ValueError, "silent"):
            audition.validate_waveform(np.zeros(8, dtype=np.float32), 24_000)
        with self.assertRaisesRegex(ValueError, "finite"):
            audition.validate_waveform(np.array([0.0, np.nan], dtype=np.float32), 24_000)

    def test_metrics_publish_failure_removes_only_the_new_wave(self):
        audition = load_audition_module()
        waveform = np.array([0.0, 0.25], dtype=np.float32)

        with tempfile.TemporaryDirectory() as temporary_directory:
            output_root = Path(temporary_directory)
            wav_path, metrics_path = audition.output_paths(output_root, "Serena")

            def write_wave(path, _samples, _sample_rate, **_kwargs):
                Path(path).write_bytes(b"RIFF-test-wave")
                metrics_path.write_text("created-by-another-process", encoding="utf-8")

            with self.assertRaisesRegex(FileExistsError, "refusing to overwrite"):
                audition.save_outputs(
                    output_root,
                    "Serena",
                    waveform,
                    24_000,
                    {"schemaVersion": 1, "speaker": "Serena"},
                    write_wave,
                )

            self.assertFalse(wav_path.exists())
            self.assertEqual(
                metrics_path.read_text(encoding="utf-8"),
                "created-by-another-process",
            )


if __name__ == "__main__":
    unittest.main()
