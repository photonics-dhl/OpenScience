import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./import-scansci-cookies.sh', import.meta.url), 'utf8');

test('operator cookie import removes staging copies and atomically persists the accepted session', () => {
  assert.match(source, /HOST_IMPORT_ROOT="\/run\/openscience-scansci-import"/u);
  assert.match(source, /CONTAINER="openscience-prod-scansci-mcp-1"/u);
  assert.match(source, /DEPLOY_LOCK_PATH="\$DEPLOY_LOCK_DIRECTORY\/lock"/u);
  assert.match(source, /flock -n -E 73 9/u);
  assert.match(source, /ACTIVE_SHA="\$\(cat "\$ACTIVE_MARKER"\)"/u);
  assert.match(source, /CAPABILITY_ROOT="\/opt\/openscience\/\.release-capabilities"/u);
  assert.match(source, /read_capability scansci_mcp_image_id/u);
  assert.match(source, /verify-scansci-mcp-runtime\.mjs/u);
  assert.match(source, /realpath -e/u);
  assert.match(source, /stat -c '%u:%a:%h:%s'/u);
  assert.match(source, /--user 10001:10001/u);
  assert.match(source, /\/tmp\/scansci-cookie-import\/netscape\.txt/u);
  assert.match(source, /PERSISTENT_SESSION_FILE="\/data\/scansci\/publisher-session\.netscape"/u);
  assert.match(source, /PERSISTENT_SESSION_NEXT="\/data\/scansci\/\.publisher-session\.netscape\.next"/u);
  assert.match(source, /os\.replace\(staged, target\)/u);
  assert.match(source, /stat\.S_IMODE\(target\.stat\(\)\.st_mode\) != 0o600/u);
  assert.match(source, /map\(Path, sys\.argv\[2:\]\)/u);
  assert.match(source, /PERSIST_STAGED=1/u);
  assert.doesNotMatch(source, /mkdir -p/u);
  assert.match(source, /scansci_pdf_login/u);
  assert.match(source, /"kind":"cookie_import"/u);
  assert.match(source, /payload\.get\("imported"\)/u);
  assert.match(source, /trap cleanup_on_exit EXIT/u);
  assert.match(source, /trap 'exit 130' INT/u);
  assert.match(source, /trap 'exit 143' TERM/u);
  assert.match(source, /\.cleanup-required/u);
  assert.match(source, /rm -f -- "\$SOURCE_FILE"/u);
  assert.match(source, /SCANSCI_COOKIE_IMPORT_OK/u);
  assert.doesNotMatch(source, /cat "\$SOURCE_FILE"|result\.content.*print/u);
  const cleanupOwnershipIndex = source.indexOf('STAGED=1');
  const containerStagingIndex = source.indexOf('docker exec -i --user 10001:10001');
  assert.notEqual(cleanupOwnershipIndex, -1, 'cleanup ownership assignment must exist');
  assert.notEqual(containerStagingIndex, -1, 'container staging command must exist');
  assert.ok(
    cleanupOwnershipIndex < containerStagingIndex,
    'cleanup ownership must be established before container staging begins',
  );
});
