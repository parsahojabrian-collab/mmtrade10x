import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "uipromax_r2_deploy", Path("deploy/uipromax-real-r2.py")
)
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)

class DeployHashTests(unittest.TestCase):
    def test_git_blob_hash_uses_nul_delimited_git_header(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.txt"
            path.write_bytes(b"test")
            expected = hashlib.sha1(b"blob 4\0test").hexdigest()
            self.assertEqual(DEPLOY.git_blob_sha(path), expected)

    def test_state_accepts_exact_before_and_after_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source.txt"
            path.write_bytes(b"old")
            old = hashlib.sha1(b"blob 3\0old").hexdigest()
            new = hashlib.sha1(b"blob 3\0new").hexdigest()
            row = {"before": old, "after": new}
            self.assertEqual(DEPLOY.state(path, row), "READY")
            path.write_bytes(b"new")
            self.assertEqual(DEPLOY.state(path, row), "ALREADY_INSTALLED")
            path.write_bytes(b"other")
            self.assertTrue(DEPLOY.state(path, row).startswith("CONFLICT:"))

    def test_new_files_are_ready_but_unexpected_existing_files_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "new.css"
            new = hashlib.sha1(b"blob 3\0new").hexdigest()
            row = {"before": None, "after": new}
            self.assertEqual(DEPLOY.state(path, row), "READY_NEW_FILE")
            path.write_bytes(b"bad")
            self.assertTrue(DEPLOY.state(path, row).startswith("CONFLICT:"))

if __name__ == "__main__":
    unittest.main()
