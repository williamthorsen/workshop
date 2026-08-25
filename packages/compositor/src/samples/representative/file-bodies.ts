/** File bodies: the content the representative sample's files contain on each side of their diffs. */

import { Buffer } from 'node:buffer';

// The bodies below interpolate these markers, so alphabetizing the module would break its initialization.
export const FILL_CLOSE = '<!-- /fill:rulebook:naming -->';
export const FILL_OPEN = '<!-- fill:rulebook:naming -->';
export const INLAY_CLOSE = '<!-- inlay:preferences:end -->';
export const INLAY_OPEN = '<!-- inlay:preferences:start -->';
export const NAMING_RULE = 'Name functions with a leading verb.';
export const REGION_CLOSE = '<!-- ambient:end -->';
export const REGION_OPEN = '<!-- ambient:start -->';

export const AUDITOR_CURRENT = '# Auditor\n\nAudit the change.\n';
export const AUDITOR_PLANNED = '# Auditor\n\nAudit the change against its ticket.\n';
export const CLAUDE_MD_CURRENT = `# Guidance\n\n${REGION_OPEN}\n<!-- rulebook:style -->\nUse sentence case.\n<!-- /rulebook:style -->\n${REGION_CLOSE}\n`;
export const CLAUDE_MD_PLANNED = `# Guidance\n\n${REGION_OPEN}\n<!-- rulebook:naming -->\n${NAMING_RULE}\n<!-- /rulebook:naming -->\n\n<!-- rulebook:style -->\nUse sentence case.\n<!-- /rulebook:style -->\n\n<!-- rulebook:tests -->\nName tests for the behavior they pin.\n<!-- /rulebook:tests -->\n${REGION_CLOSE}\n`;
// A PNG signature stands in for a skill asset the engine copies byte for byte.
export const DIAGRAM_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
export const LINT_SKILL = '# Lint\n\nRun the linter.\n';
export const RETIRED_SKILL_CURRENT = '# Retired\n\nSuperseded.\n';
export const REVIEW_SKILL_CURRENT = '# Review\n\nRead the diff.\n';
// The rulebook fills the inlay this body declares, so one file contains contributions from two artifacts.
export const REVIEW_SKILL_PLANNED = `# Review\n\nRead the diff, then the tests.\n\n${INLAY_OPEN}\n${FILL_OPEN}\n${NAMING_RULE}\n${FILL_CLOSE}\n${INLAY_CLOSE}\n`;
// The first hook belongs to another tool and has no sentinel; the engine owns only the entries marked with one.
// The planned side is what entry ownership writes, expanded because an indented `JSON.stringify` holds no item inline.
export const SETTINGS_JSON_CURRENT =
  '{\n  "hooks": [\n    { "command": "vendor-tool sync" },\n    { "command": "relay --on=stop", "source": "codeassembly" }\n  ]\n}\n';
export const SETTINGS_JSON_PLANNED =
  '{\n  "hooks": [\n    {\n      "command": "vendor-tool sync"\n    },\n    {\n      "command": "relay --on=stop",\n      "source": "codeassembly"\n    },\n    {\n      "command": "relay --on=review",\n      "source": "codeassembly"\n    }\n  ]\n}\n';
