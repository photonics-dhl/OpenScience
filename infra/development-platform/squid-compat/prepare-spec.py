"""Edit only the inspected vendor RPM release and add the upstream source patch."""
from pathlib import Path
import sys

spec = Path(sys.argv[1])
text = spec.read_text()
release = "Release:  %{anolis_release}%{?dist}"
patch_anchor = "# Local patches\n"
if text.count(release) != 1 or text.count(patch_anchor) != 1:
    raise SystemExit("The vendor spec differs from squid-7.2-1.alnx4; do not improvise a rebuild.")
text = text.replace(release, release + ".openscience.1", 1)
text = text.replace(patch_anchor, "# Upstream Bug 5520, commit ab5cf0c36b538627c82b3989d6c87d1668c7e081\n"
                    "Patch001: squid-bug5520.patch\n\n" + patch_anchor, 1)
spec.write_text(text)
