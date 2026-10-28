"""Build a deterministic unpacked-extension ZIP from an explicit allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json
root = Path(__file__).resolve().parent.parent
version = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["version"]
files = ["manifest.json", "index.html", "style.css", "api.mjs", "app.mjs",
         "background.js", "content.js", "core.mjs", "native-policy.mjs",
         "runner.mjs", "README.md", "README.en.md", "使用说明.md", "CHANGELOG.md"]
dist = root / "dist"
dist.mkdir(exist_ok=True)
target = dist / f"PubMed-NBIB-Native-v{version}.zip"
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for name in sorted(files):
        info = ZipInfo(f"PubMed-NBIB-Native/{name}", (2026, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (root / name).read_text(encoding="utf-8").encode("utf-8"))
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(dist / "SHA256SUMS.txt").write_text(f"{digest}  {target.name}\n", encoding="utf-8")
print(f"Built {target.name} ({target.stat().st_size} bytes)")
print(f"SHA256 {digest}")
