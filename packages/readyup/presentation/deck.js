"use strict";
var ReadyupDeck = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // presentation/src/deck.ts
  var deck_exports = {};
  __export(deck_exports, {
    KITS: () => KITS,
    renderDeployRun: () => renderDeployRun,
    renderKit: () => renderKit,
    toHtml: () => toHtml
  });

  // presentation/src/kits.ts
  var CAPTURED_READYUP_VERSION = "0.42.0";
  var TOOLBELT_README = "https://github.com/williamthorsen/toolbelt/tree/main/packages/errors#readme";
  var KITS = {
    preflight: {
      name: "preflight",
      command: "rdy run preflight",
      compiledWith: "0.42.0",
      conditions: [
        { id: "docker", label: "Docker is running", on: true },
        { id: "api", label: "API is listening on port 3000", on: true }
      ],
      checklists: [
        {
          name: "preflight",
          ms: 546,
          checks: [
            {
              name: "Docker daemon is running",
              severity: "error",
              when: "docker",
              ms: 544,
              fix: "Start Docker, then run the checks again"
            },
            {
              name: "API is listening on port 3000",
              severity: "warn",
              when: "api",
              ms: 45,
              failDetail: "Nothing is listening on port 3000",
              fix: "Start the API with pnpm dev before the smoke test"
            }
          ]
        }
      ]
    },
    drift: {
      name: "default",
      command: "rdy run --from npm:@williamthorsen/release-kit",
      origin: { source: "npm:@williamthorsen/release-kit", version: "14.2.2" },
      compiledWith: "0.41.0",
      conditions: [
        { id: "current", label: "release-kit is current", on: true },
        { id: "publish", label: "publish.yaml matches its template", on: true },
        { id: "labels", label: "labels.yaml has the current preset", on: true },
        { id: "sync", label: "sync-labels.yaml exists", on: true }
      ],
      checklists: [
        {
          name: "release-kit",
          ms: 170,
          checks: [
            {
              name: "@williamthorsen/release-kit in devDependencies",
              severity: "error",
              ms: 136,
              fix: "pnpm add --save-dev @williamthorsen/release-kit",
              checks: [
                {
                  name: "@williamthorsen/release-kit >= 14.2.2",
                  severity: "error",
                  when: "current",
                  fix: "pnpm add --save-dev @williamthorsen/release-kit@^14.2.2"
                }
              ]
            },
            {
              name: "publish.yaml workflow exists",
              severity: "warn",
              checks: [
                {
                  name: "publish.yaml matches template",
                  severity: "warn",
                  when: "publish",
                  fix: "Run `release-kit update-templates` to regenerate publish.yaml from the current template"
                }
              ]
            },
            {
              name: ".config/release-kit.config.ts exports a config",
              severity: "error",
              checks: [
                {
                  name: ".github/labels.yaml exists",
                  severity: "warn",
                  fix: "Run `release-kit sync-labels generate` to produce the labels file",
                  checks: [
                    {
                      name: "labels.yaml has current common preset",
                      severity: "warn",
                      when: "labels",
                      fix: "Run `release-kit sync-labels generate` to incorporate updated common labels"
                    }
                  ]
                }
              ]
            },
            {
              name: "published packages ship the changelog archives",
              severity: "warn",
              na: "changelogMarkdown.keepVersions is not set"
            },
            {
              name: "sync-labels.yaml workflow exists",
              severity: "warn",
              when: "sync",
              fix: "Run `release-kit sync-labels init` to scaffold the workflow",
              checks: [{ name: "sync-labels.yaml matches template", severity: "warn" }]
            }
          ]
        }
      ]
    },
    adoption: {
      name: "default",
      command: "rdy run --from npm:@williamthorsen/toolbelt.errors",
      origin: { source: "npm:@williamthorsen/toolbelt.errors", version: "0.8.3" },
      compiledWith: "0.40.0",
      conditions: [
        { id: "helper", label: "Sources import describeError", on: true },
        { id: "inline", label: "Sources describe thrown values with it", on: true },
        { id: "narrow", label: "Sources narrow thrown values with isError", on: false },
        { id: "coerce", label: "Sources do not coerce thrown values by hand", on: true }
      ],
      checklists: [
        {
          name: "adoption",
          ms: 1515,
          checks: [
            {
              name: "No source defines its own description helper",
              id: "toolbelt.errors/no-describe-clone",
              progress: [72, 73],
              findings: true,
              severity: "warn",
              when: "helper",
              failDetail: "describeFailure (packages/repo-tools/src/probe/probe.ts:3)",
              fix: "Delete the function named above and import describeError from @williamthorsen/toolbelt.errors. One import replaces the whole helper. Reference: " + TOOLBELT_README
            },
            {
              name: "No source describes a thrown value inline",
              id: "toolbelt.errors/no-inline-description",
              progress: [72, 73],
              findings: true,
              severity: "warn",
              when: "inline",
              failDetail: "packages/repo-tools/src/probe/probe.ts:4",
              fix: "Replace each expression named above with describeError, imported from @williamthorsen/toolbelt.errors. A domain-literal fallback discards what was thrown; describeError keeps it."
            },
            {
              name: "No source narrows a thrown value by hand",
              id: "toolbelt.errors/no-instanceof-error",
              progress: [72, 73],
              findings: true,
              severity: "recommend",
              when: "narrow",
              failDetail: "packages/readyup/src/run/runRdy.ts:264",
              fix: "Use isError from @williamthorsen/toolbelt.errors, or assertIsError from @williamthorsen/toolbelt.errors/candidate when the narrowing throws. Both recognize an Error crossing a realm boundary, which a bare instanceof test reports as false."
            },
            {
              name: "No source coerces a thrown value to an Error by hand",
              id: "toolbelt.errors/no-error-coercion",
              progress: [72, 73],
              findings: true,
              severity: "recommend",
              when: "coerce",
              failDetail: "packages/repo-tools/src/probe/probe.ts:9",
              fix: "@williamthorsen/toolbelt.errors publishes no coercer, so this reports an unmet need rather than a substitution. Raise it at " + TOOLBELT_README + " if the sites above are worth one."
            }
          ]
        }
      ]
    },
    onboard: {
      name: "machine",
      command: "rdy run --jit machine",
      conditions: [
        { id: "brewfile", label: "Brewfile is satisfied", on: true },
        { id: "live", label: "live worktree exists", on: true },
        { id: "gitconfig", label: "~/.gitconfig is clean", on: false }
      ],
      checklists: [
        {
          name: "tools",
          ms: 4926,
          checks: [
            {
              name: "brew is installed",
              severity: "error",
              checks: [
                {
                  name: "Homebrew packages match the Brewfile",
                  severity: "warn",
                  when: "brewfile",
                  ms: 4885,
                  failDetail: "Formula delta needs to be installed or updated.\nFormula zoxide needs to be installed or updated.",
                  fix: "brew bundle install --global"
                }
              ]
            }
          ]
        },
        {
          name: "install",
          ms: 1034,
          checks: [
            {
              name: "live worktree is checked out on branch live",
              severity: "error",
              when: "live",
              detail: "~/repos/configs/macos.live is a worktree of ~/repos/configs/macos",
              failDetail: "~/repos/configs/macos.live does not exist",
              fix: "Run configs-bootstrap, which creates the live branch and worktree when absent; first move aside anything else at ~/repos/configs/macos.live",
              checks: [
                {
                  name: "Machine profile resolves to a profile root",
                  severity: "error",
                  detail: "Profile laptop resolves to ~/repos/configs/macos.live/profiles/laptop",
                  checks: [
                    {
                      name: "Every varied path has a current mirror point",
                      severity: "warn",
                      detail: "The profile root varies no base file"
                    }
                  ]
                }
              ]
            },
            {
              name: "~/.gitconfig sets nothing outside its include chain",
              severity: "warn",
              when: "gitconfig",
              failDetail: "commit.gpgsign=true\ngpg.format=ssh",
              fix: 'Move each setting to the fragment that README.md, section "Git identity, signing, and GitHub credentials", names, then remove it from ~/.gitconfig'
            }
          ]
        }
      ]
    }
  };

  // ../../node_modules/.pnpm/@williamthorsen+toolbelt.terminal@0.3.0/node_modules/@williamthorsen/toolbelt.terminal/dist/esm/3-candidate/defineGlyphSet.js
  var PLAIN_PATTERN = /^[\u{20}-\u{7E}]*$/u;
  var RICH_PATTERN = /^[\p{Emoji_Presentation}--\p{Regional_Indicator}]$/v;
  var RICH_WIDTH = 2;
  function defineGlyphSet(variants) {
    const entries = listVariantEntries(variants);
    const violations = entries.flatMap(([name, variant]) => listViolations(name, variant));
    if (violations.length > 0) {
      throw new TypeError(`Glyph set is invalid.
${violations.map((violation) => `- ${violation}`).join("\n")}`);
    }
    return {
      plain: toGlyphRecord(entries.map(([name, { plain }]) => [name, { text: plain, width: plain.length }])),
      rich: toGlyphRecord(entries.map(([name, { rich }]) => [name, { text: rich, width: RICH_WIDTH }]))
    };
  }
  function measureGlyphColumn(glyphs) {
    const widths = Object.values(glyphs).map((glyph) => glyph.width);
    return widths.length === 0 ? 0 : Math.max(...widths);
  }
  function listVariantEntries(variants) {
    return Object.entries(variants);
  }
  function listViolations(name, variants) {
    const violations = [];
    const subject = JSON.stringify(name);
    if (!RICH_PATTERN.test(variants.rich)) {
      const glyph = JSON.stringify(variants.rich);
      violations.push(`${subject}: rich glyph ${glyph} is not a single Emoji_Presentation code point outside the regional indicators.`);
    }
    if (!PLAIN_PATTERN.test(variants.plain)) {
      const glyph = JSON.stringify(variants.plain);
      violations.push(`${subject}: plain glyph ${glyph} is not printable ASCII (U+0020 to U+007E).`);
    }
    return violations;
  }
  function toGlyphRecord(entries) {
    return Object.fromEntries(entries);
  }

  // ../../node_modules/.pnpm/ansi-regex@6.4.0/node_modules/ansi-regex/index.js
  function ansiRegex({ onlyFirst = false } = {}) {
    const ST = "(?:\\u0007|\\u001B\\u005C|\\u009C)";
    const osc = `(?:(?:\\u001B\\]|\\u009D)[^\\u0007\\u001B\\u009C\\u009D]*${ST})`;
    const csi = "[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]";
    const pattern = `${osc}|${csi}`;
    return new RegExp(pattern, onlyFirst ? void 0 : "g");
  }

  // ../../node_modules/.pnpm/strip-ansi@7.2.0/node_modules/strip-ansi/index.js
  var regex = ansiRegex();
  function stripAnsi(string) {
    if (typeof string !== "string") {
      throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
    }
    if (!string.includes("\x1B") && !string.includes("")) {
      return string;
    }
    return string.replace(regex, "");
  }

  // ../../node_modules/.pnpm/get-east-asian-width@1.7.0/node_modules/get-east-asian-width/lookup-data.js
  var ambiguousMinimalCodePoint = 161;
  var ambiguousMaximumCodePoint = 1114109;
  var ambiguousRanges = [161, 161, 164, 164, 167, 168, 170, 170, 173, 174, 176, 180, 182, 186, 188, 191, 198, 198, 208, 208, 215, 216, 222, 225, 230, 230, 232, 234, 236, 237, 240, 240, 242, 243, 247, 250, 252, 252, 254, 254, 257, 257, 273, 273, 275, 275, 283, 283, 294, 295, 299, 299, 305, 307, 312, 312, 319, 322, 324, 324, 328, 331, 333, 333, 338, 339, 358, 359, 363, 363, 462, 462, 464, 464, 466, 466, 468, 468, 470, 470, 472, 472, 474, 474, 476, 476, 593, 593, 609, 609, 708, 708, 711, 711, 713, 715, 717, 717, 720, 720, 728, 731, 733, 733, 735, 735, 768, 879, 913, 929, 931, 937, 945, 961, 963, 969, 1025, 1025, 1040, 1103, 1105, 1105, 8208, 8208, 8211, 8214, 8216, 8217, 8220, 8221, 8224, 8226, 8228, 8231, 8240, 8240, 8242, 8243, 8245, 8245, 8251, 8251, 8254, 8254, 8308, 8308, 8319, 8319, 8321, 8324, 8364, 8364, 8451, 8451, 8453, 8453, 8457, 8457, 8467, 8467, 8470, 8470, 8481, 8482, 8486, 8486, 8491, 8491, 8531, 8532, 8539, 8542, 8544, 8555, 8560, 8569, 8585, 8585, 8592, 8601, 8632, 8633, 8658, 8658, 8660, 8660, 8679, 8679, 8704, 8704, 8706, 8707, 8711, 8712, 8715, 8715, 8719, 8719, 8721, 8721, 8725, 8725, 8730, 8730, 8733, 8736, 8739, 8739, 8741, 8741, 8743, 8748, 8750, 8750, 8756, 8759, 8764, 8765, 8776, 8776, 8780, 8780, 8786, 8786, 8800, 8801, 8804, 8807, 8810, 8811, 8814, 8815, 8834, 8835, 8838, 8839, 8853, 8853, 8857, 8857, 8869, 8869, 8895, 8895, 8978, 8978, 9312, 9449, 9451, 9547, 9552, 9587, 9600, 9615, 9618, 9621, 9632, 9633, 9635, 9641, 9650, 9651, 9654, 9655, 9660, 9661, 9664, 9665, 9670, 9672, 9675, 9675, 9678, 9681, 9698, 9701, 9711, 9711, 9733, 9734, 9737, 9737, 9742, 9743, 9756, 9756, 9758, 9758, 9792, 9792, 9794, 9794, 9824, 9825, 9827, 9829, 9831, 9834, 9836, 9837, 9839, 9839, 9886, 9887, 9919, 9919, 9926, 9933, 9935, 9939, 9941, 9953, 9955, 9955, 9960, 9961, 9963, 9969, 9972, 9972, 9974, 9977, 9979, 9980, 9982, 9983, 10045, 10045, 10102, 10111, 11094, 11097, 12872, 12879, 57344, 63743, 65024, 65039, 65533, 65533, 127232, 127242, 127248, 127277, 127280, 127337, 127344, 127373, 127375, 127376, 127387, 127404, 917760, 917999, 983040, 1048573, 1048576, 1114109];
  var fullwidthMinimalCodePoint = 12288;
  var fullwidthMaximumCodePoint = 65510;
  var fullwidthRanges = [12288, 12288, 65281, 65376, 65504, 65510];
  var wideMinimalCodePoint = 4352;
  var wideMaximumCodePoint = 262141;
  var wideRanges = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101594, 101631, 101664, 101760, 101874, 101888, 102801, 102816, 102866, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110888, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110952, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127406, 127406, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128729, 128732, 128735, 128747, 128748, 128756, 128764, 128986, 128986, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129734, 129736, 129736, 129740, 129757, 129759, 129771, 129775, 129786, 131072, 196605, 196608, 262141];

  // ../../node_modules/.pnpm/get-east-asian-width@1.7.0/node_modules/get-east-asian-width/utilities.js
  var isInRange = (ranges, codePoint) => {
    let low = 0;
    let high = Math.floor(ranges.length / 2) - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const i = mid * 2;
      if (codePoint < ranges[i]) {
        high = mid - 1;
      } else if (codePoint > ranges[i + 1]) {
        low = mid + 1;
      } else {
        return true;
      }
    }
    return false;
  };

  // ../../node_modules/.pnpm/get-east-asian-width@1.7.0/node_modules/get-east-asian-width/lookup.js
  var commonCjkCodePoint = 19968;
  var [wideFastPathStart, wideFastPathEnd] = /* @__PURE__ */ findWideFastPathRange(wideRanges);
  function findWideFastPathRange(ranges) {
    let fastPathStart = ranges[0];
    let fastPathEnd = ranges[1];
    for (let index = 0; index < ranges.length; index += 2) {
      const start = ranges[index];
      const end = ranges[index + 1];
      if (commonCjkCodePoint >= start && commonCjkCodePoint <= end) {
        return [start, end];
      }
      if (end - start > fastPathEnd - fastPathStart) {
        fastPathStart = start;
        fastPathEnd = end;
      }
    }
    return [fastPathStart, fastPathEnd];
  }
  var isAmbiguous = (codePoint) => {
    if (codePoint < ambiguousMinimalCodePoint || codePoint > ambiguousMaximumCodePoint) {
      return false;
    }
    return isInRange(ambiguousRanges, codePoint);
  };
  var isFullwidth = (codePoint) => {
    if (codePoint < fullwidthMinimalCodePoint || codePoint > fullwidthMaximumCodePoint) {
      return false;
    }
    return isInRange(fullwidthRanges, codePoint);
  };
  var isWide = (codePoint) => {
    if (codePoint >= wideFastPathStart && codePoint <= wideFastPathEnd) {
      return true;
    }
    if (codePoint < wideMinimalCodePoint || codePoint > wideMaximumCodePoint) {
      return false;
    }
    return isInRange(wideRanges, codePoint);
  };

  // ../../node_modules/.pnpm/get-east-asian-width@1.7.0/node_modules/get-east-asian-width/index.js
  function validate(codePoint) {
    if (!Number.isSafeInteger(codePoint)) {
      throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
    }
  }
  function eastAsianWidth(codePoint, { ambiguousAsWide = false } = {}) {
    validate(codePoint);
    if (isFullwidth(codePoint) || isWide(codePoint) || ambiguousAsWide && isAmbiguous(codePoint)) {
      return 2;
    }
    return 1;
  }

  // ../../node_modules/.pnpm/string-width@8.3.0/node_modules/string-width/index.js
  var segmenter = new Intl.Segmenter();
  var visibleCharacterRegex = /[^\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Nonspacing_Mark}\p{Enclosing_Mark}\p{Surrogate}]/v;
  var spacingMarkRegex = /\p{Spacing_Mark}/v;
  var rgiEmojiRegex = /^\p{RGI_Emoji}$/v;
  var unqualifiedKeycapRegex = /^[\d#*]\u20E3$/;
  var extendedPictographicRegex = /\p{Extended_Pictographic}/gu;
  function isDoubleWidthNonRgiEmojiSequence(segment) {
    if (segment.length > 50) {
      return false;
    }
    if (unqualifiedKeycapRegex.test(segment)) {
      return true;
    }
    if (segment.includes("‍")) {
      const pictographics = segment.match(extendedPictographicRegex);
      return pictographics !== null && pictographics.length >= 2;
    }
    return false;
  }
  function baseVisible(segment) {
    const index = segment.search(visibleCharacterRegex);
    return index === -1 ? void 0 : segment.slice(index);
  }
  function isHangulLeadingJamo(codePoint) {
    return codePoint >= 4352 && codePoint <= 4447 || codePoint >= 43360 && codePoint <= 43388;
  }
  function isHangulVowelJamo(codePoint) {
    return codePoint >= 4448 && codePoint <= 4519 || codePoint >= 55216 && codePoint <= 55238;
  }
  function isHangulTrailingJamo(codePoint) {
    return codePoint >= 4520 && codePoint <= 4607 || codePoint >= 55243 && codePoint <= 55291;
  }
  function isHangulJamo(codePoint) {
    return isHangulLeadingJamo(codePoint) || isHangulVowelJamo(codePoint) || isHangulTrailingJamo(codePoint);
  }
  function hangulClusterWidth(visibleSegment, eastAsianWidthOptions) {
    const codePoints = [];
    for (const character of visibleSegment) {
      if (!visibleCharacterRegex.test(character)) {
        continue;
      }
      codePoints.push(character.codePointAt(0));
    }
    if (codePoints.length === 0) {
      return void 0;
    }
    let width = 0;
    for (let index = 0; index < codePoints.length; index++) {
      const codePoint = codePoints[index];
      if (!isHangulJamo(codePoint)) {
        if (width === 0) {
          return void 0;
        }
        for (let remaining = index; remaining < codePoints.length; remaining++) {
          width += eastAsianWidth(codePoints[remaining], eastAsianWidthOptions);
        }
        return width;
      }
      if (isHangulLeadingJamo(codePoint) && isHangulVowelJamo(codePoints[index + 1])) {
        width += 2;
        index += isHangulTrailingJamo(codePoints[index + 2]) ? 2 : 1;
        continue;
      }
      width += eastAsianWidth(codePoint, eastAsianWidthOptions);
    }
    return width;
  }
  function trailingWidth(visibleSegment, eastAsianWidthOptions) {
    let extra = 0;
    let first = true;
    for (const character of visibleSegment) {
      if (first) {
        first = false;
        continue;
      }
      if (spacingMarkRegex.test(character) || character >= "＀" && character <= "￯") {
        extra += eastAsianWidth(character.codePointAt(0), eastAsianWidthOptions);
      }
    }
    return extra;
  }
  function stringWidth(input, options = {}) {
    if (typeof input !== "string" || input.length === 0) {
      return 0;
    }
    const {
      ambiguousIsNarrow = true,
      countAnsiEscapeCodes = false
    } = options;
    let string = input;
    if (!countAnsiEscapeCodes && (string.includes("\x1B") || string.includes(""))) {
      string = stripAnsi(string);
    }
    if (string.length === 0) {
      return 0;
    }
    if (/^[\u0020-\u007E]*$/.test(string)) {
      return string.length;
    }
    let width = 0;
    const eastAsianWidthOptions = { ambiguousAsWide: !ambiguousIsNarrow };
    for (const { segment } of segmenter.segment(string)) {
      const visibleSegment = baseVisible(segment);
      if (visibleSegment === void 0) {
        continue;
      }
      if (rgiEmojiRegex.test(segment) || isDoubleWidthNonRgiEmojiSequence(segment)) {
        width += 2;
        continue;
      }
      const hangulWidth = hangulClusterWidth(visibleSegment, eastAsianWidthOptions);
      if (hangulWidth !== void 0) {
        width += hangulWidth;
        continue;
      }
      const codePoint = visibleSegment.codePointAt(0);
      width += eastAsianWidth(codePoint, eastAsianWidthOptions);
      width += trailingWidth(visibleSegment, eastAsianWidthOptions);
    }
    return width;
  }

  // ../../node_modules/.pnpm/@williamthorsen+toolbelt.terminal@0.3.0/node_modules/@williamthorsen/toolbelt.terminal/dist/esm/3-candidate/measureWidth.js
  function measureWidth(text) {
    return stringWidth(text);
  }

  // ../../node_modules/.pnpm/ansi-styles@7.0.0/node_modules/ansi-styles/index.js
  var ANSI_BACKGROUND_OFFSET = 10;
  var ANSI_UNDERLINE_OFFSET = 20;
  var wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
  var wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
  var wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
  var wrapUnderlineAnsi = (code) => `\x1B[58;5;${code < 90 ? code - 30 : code - 90 + 8}m`;
  var blackBright = [90, 39];
  var bgBlackBright = [100, 49];
  var styles = {
    modifier: {
      reset: [0, 0],
      // 21 isn't widely supported and 22 does the same thing
      bold: [1, 22],
      dim: [2, 22],
      italic: [3, 23],
      underline: [4, 24],
      // Extended underline styles (`SGR 4:x` sub-parameters). Not in upstream `ansi-styles`.
      underlineDouble: ["4:2", 24],
      underlineCurly: ["4:3", 24],
      underlineDotted: ["4:4", 24],
      underlineDashed: ["4:5", 24],
      overline: [53, 55],
      inverse: [7, 27],
      hidden: [8, 28],
      strikethrough: [9, 29]
    },
    color: {
      black: [30, 39],
      red: [31, 39],
      green: [32, 39],
      yellow: [33, 39],
      blue: [34, 39],
      magenta: [35, 39],
      cyan: [36, 39],
      white: [37, 39],
      // Bright color
      blackBright,
      gray: blackBright,
      grey: blackBright,
      redBright: [91, 39],
      greenBright: [92, 39],
      yellowBright: [93, 39],
      blueBright: [94, 39],
      magentaBright: [95, 39],
      cyanBright: [96, 39],
      whiteBright: [97, 39]
    },
    bgColor: {
      bgBlack: [40, 49],
      bgRed: [41, 49],
      bgGreen: [42, 49],
      bgYellow: [43, 49],
      bgBlue: [44, 49],
      bgMagenta: [45, 49],
      bgCyan: [46, 49],
      bgWhite: [47, 49],
      // Bright color
      bgBlackBright,
      bgGray: bgBlackBright,
      bgGrey: bgBlackBright,
      bgRedBright: [101, 49],
      bgGreenBright: [102, 49],
      bgYellowBright: [103, 49],
      bgBlueBright: [104, 49],
      bgMagentaBright: [105, 49],
      bgCyanBright: [106, 49],
      bgWhiteBright: [107, 49]
    },
    // Underline color (`SGR 58`/`59`). Not in upstream `ansi-styles`.
    underlineColor: {
      underlineBlack: ["58;5;0", 59],
      underlineRed: ["58;5;1", 59],
      underlineGreen: ["58;5;2", 59],
      underlineYellow: ["58;5;3", 59],
      underlineBlue: ["58;5;4", 59],
      underlineMagenta: ["58;5;5", 59],
      underlineCyan: ["58;5;6", 59],
      underlineWhite: ["58;5;7", 59],
      // Bright color
      underlineBlackBright: ["58;5;8", 59],
      underlineGray: ["58;5;8", 59],
      // Alias of `underlineBlackBright`
      underlineGrey: ["58;5;8", 59],
      // Alias of `underlineBlackBright`
      underlineRedBright: ["58;5;9", 59],
      underlineGreenBright: ["58;5;10", 59],
      underlineYellowBright: ["58;5;11", 59],
      underlineBlueBright: ["58;5;12", 59],
      underlineMagentaBright: ["58;5;13", 59],
      underlineCyanBright: ["58;5;14", 59],
      underlineWhiteBright: ["58;5;15", 59]
    }
  };
  var modifierNames = Object.keys(styles.modifier);
  var foregroundColorNames = Object.keys(styles.color);
  var backgroundColorNames = Object.keys(styles.bgColor);
  var underlineColorNames = Object.keys(styles.underlineColor);
  var colorNames = [...foregroundColorNames, ...backgroundColorNames];
  function assembleStyles() {
    const codes = /* @__PURE__ */ new Map();
    for (const [groupName, group] of Object.entries(styles)) {
      for (const [styleName, style] of Object.entries(group)) {
        styles[styleName] = {
          open: `\x1B[${style[0]}m`,
          close: `\x1B[${style[1]}m`
        };
        group[styleName] = styles[styleName];
        codes.set(Number(String(style[0]).split(/[:;]/v, 1)[0]), style[1]);
      }
      Object.defineProperty(styles, groupName, {
        value: group,
        enumerable: false
      });
    }
    Object.defineProperty(styles, "codes", {
      value: codes,
      enumerable: false
    });
    styles.color.close = "\x1B[39m";
    styles.bgColor.close = "\x1B[49m";
    styles.underlineColor.close = "\x1B[59m";
    styles.color.ansi = wrapAnsi16();
    styles.color.ansi256 = wrapAnsi256();
    styles.color.ansi16m = wrapAnsi16m();
    styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
    styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
    styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
    styles.underlineColor.ansi = wrapUnderlineAnsi;
    styles.underlineColor.ansi256 = wrapAnsi256(ANSI_UNDERLINE_OFFSET);
    styles.underlineColor.ansi16m = wrapAnsi16m(ANSI_UNDERLINE_OFFSET);
    Object.defineProperties(styles, {
      rgbToAnsi256: {
        value(red, green, blue) {
          if (red === green && green === blue) {
            if (red < 8) {
              return 16;
            }
            if (red > 248) {
              return 231;
            }
            return Math.round((red - 8) / 247 * 24) + 232;
          }
          return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
        },
        enumerable: false
      },
      hexToRgb: {
        value(hex) {
          const matches = /[\da-f]{6}|[\da-f]{3}/iv.exec(hex.toString(16));
          if (!matches) {
            return [0, 0, 0];
          }
          let [colorString] = matches;
          if (colorString.length === 3) {
            colorString = [...colorString].map((character) => character + character).join("");
          }
          const integer = Number.parseInt(colorString, 16);
          return [
            /* eslint-disable no-bitwise -- We need the speed */
            integer >> 16 & 255,
            integer >> 8 & 255,
            integer & 255
            /* eslint-enable no-bitwise */
          ];
        },
        enumerable: false
      },
      hexToAnsi256: {
        value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
        enumerable: false
      },
      ansi256ToAnsi: {
        value(code) {
          if (code < 8) {
            return 30 + code;
          }
          if (code < 16) {
            return 90 + (code - 8);
          }
          let red;
          let green;
          let blue;
          if (code >= 232) {
            red = ((code - 232) * 10 + 8) / 255;
            green = red;
            blue = red;
          } else {
            code -= 16;
            const remainder = code % 36;
            red = Math.floor(code / 36) / 5;
            green = Math.floor(remainder / 6) / 5;
            blue = remainder % 6 / 5;
          }
          const value = Math.max(red, green, blue) * 2;
          if (value === 0) {
            return 30;
          }
          let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
          if (value === 2) {
            result += 60;
          }
          return result;
        },
        enumerable: false
      },
      rgbToAnsi: {
        value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
        enumerable: false
      },
      hexToAnsi: {
        value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
        enumerable: false
      }
    });
    return styles;
  }
  var ansiStyles = assembleStyles();
  var ansi_styles_default = ansiStyles;

  // src/layout/formatter.ts
  var TOKEN_NAMES = [
    "blockedPrecondition",
    "check",
    "checklist",
    "failedError",
    "failedRecommend",
    "failedWarn",
    "fix",
    "kit",
    "kitSource",
    "passed",
    "skippedOptional",
    "sourceDirectory",
    "sourcePackage",
    "sourceRemote",
    "written"
  ];
  var GLYPHS = defineGlyphSet({
    blockedPrecondition: { plain: "BLOCK", rich: "🚫" },
    check: { plain: "", rich: "🧪" },
    checklist: { plain: "", rich: "📋" },
    failedError: { plain: "FAIL", rich: "❌" },
    failedRecommend: { plain: "RECO", rich: "💡" },
    failedWarn: { plain: "WARN", rich: "🔶" },
    fix: { plain: "FIX", rich: "🔧" },
    kit: { plain: "", rich: "📓" },
    kitSource: { plain: "", rich: "📄" },
    passed: { plain: "PASS", rich: "✅" },
    skippedOptional: { plain: "SKIP", rich: "⚪" },
    sourceDirectory: { plain: "", rich: "📁" },
    sourcePackage: { plain: "", rich: "📦" },
    sourceRemote: { plain: "", rich: "🌐" },
    written: { plain: "WRITE", rich: "💾" }
  });
  var UNPAINTED = {
    rule: (text) => text,
    tally: (_key, text) => text
  };
  var plainFormatter = {
    detailSeparator: "-",
    hintPrefix: "Hint:",
    paint: UNPAINTED,
    rules: {
      kit: "=",
      section: "-"
    },
    tokens: GLYPHS.plain
  };
  var richFormatter = {
    detailSeparator: "·",
    hintPrefix: "👉 Hint:",
    paint: UNPAINTED,
    rules: {
      kit: "━",
      section: "─"
    },
    tokens: GLYPHS.rich
  };
  var TALLY_COLORS = {
    blocked: ansi_styles_default.red,
    errors: ansi_styles_default.red,
    optional: ansi_styles_default.blackBright,
    passed: ansi_styles_default.green,
    recommendations: ansi_styles_default.blackBright,
    warnings: ansi_styles_default.yellow
  };
  var richColorFormatter = {
    ...richFormatter,
    paint: {
      rule: (text) => wrap(ansi_styles_default.dim, text),
      tally: (key, text) => wrap(ansi_styles_default.bold, wrap(TALLY_COLORS[key], text))
    }
  };
  var PLAIN_BY_RICH_GLYPH = new Map(
    TOKEN_NAMES.map((name) => [GLYPHS.rich[name].text, GLYPHS.plain[name].text])
  );
  function wrap(style, text) {
    return `${style.open}${text}${style.close}`;
  }

  // ../../node_modules/.pnpm/@williamthorsen+toolbelt.strings@8.1.0/node_modules/@williamthorsen/toolbelt.strings/dist/esm/4-release/pluralize.js
  function pluralize(count, singular, plural = `${singular}s`) {
    return Math.abs(count) === 1 ? singular : plural;
  }
  function pluralizeWithCount(count, singular, plural = `${singular}s`) {
    return `${count} ${pluralize(count, singular, plural)}`;
  }

  // src/layout/layoutEngine.ts
  var DURATION_FLOOR_MS = 100;
  var HEADING_SIGIL_WIDTH = 2;
  var SEGMENT_SEPARATOR = " / ";
  var DID_NOT_LOAD_LABEL = "did not load";
  var TABLE_CELL_GAP = "  ";
  var TOTAL_LABEL = "Total:";
  var SUMMARY_HEADING = "Summary";
  var COUNT_SEPARATOR = ", ";
  var EMPTY_COUNTS = "0 passed";
  var SKIPPED_TOKENS = /* @__PURE__ */ new Set(["blockedPrecondition", "skippedOptional"]);
  var COUNT_FIELDS = [
    { key: "errors", singular: "error", plural: "errors" },
    { key: "warnings", singular: "warning", plural: "warnings" },
    { key: "recommendations", singular: "recommendation", plural: "recommendations" },
    { key: "passed", singular: "passed", plural: "passed" },
    { key: "blocked", singular: "blocked", plural: "blocked" },
    { key: "optional", singular: "skipped", plural: "skipped" }
  ];
  function createLayoutEngine(formatter) {
    const gutter = measureGlyphColumn(formatter.tokens) + 1;
    function formatBreadcrumb(segments, level, detail) {
      const rendered = segments.map((segment) => `${inlineGlyph(segment.role)}${segment.text}`);
      return formatHeading(rendered.join(SEGMENT_SEPARATOR), level, detail);
    }
    function formatCheckLine(input) {
      const segments = [`${indent(input.depth ?? 0)}${token(input.token)}${input.name}`];
      if (input.detail !== void 0) segments.push(`${formatter.detailSeparator} ${input.detail}`);
      if (input.checkId !== void 0) segments.push(`[${input.checkId}]`);
      if (input.progress !== void 0) segments.push(`[${input.progress}]`);
      const duration = resolveDuration(input.token, input.durationMs);
      if (duration !== void 0) segments.push(`(${duration})`);
      return segments.join(" ");
    }
    function formatCountLine(counts, durationMs) {
      return token(resolveWorstToken(counts.worstSeverity)) + buildCountBody(counts, durationMs);
    }
    function formatCounts(counts) {
      const fields = COUNT_FIELDS.filter((field) => counts[field.key] > 0).map(
        (field) => formatter.paint.tally(field.key, pluralizeWithCount(counts[field.key], field.singular, field.plural))
      );
      return fields.length > 0 ? fields.join(COUNT_SEPARATOR) : EMPTY_COUNTS;
    }
    function formatFix(fix) {
      return `${token("fix")}${fix}`;
    }
    function formatHeading(name, level, detail) {
      const suffix = detail === void 0 ? "" : ` ${formatter.detailSeparator} ${detail}`;
      const sigil = formatter.rules[level].repeat(HEADING_SIGIL_WIDTH);
      return `${level === "section" ? formatter.paint.rule(sigil) : sigil} ${name}${suffix}`;
    }
    function formatHint(hint) {
      return `${formatter.hintPrefix} ${hint}`;
    }
    function formatReasonBlock(reasons, depth = 0) {
      const margin = indent(depth + 1);
      return reasons.map(
        (reason) => reason.split("\n").map((line) => line === "" ? line : `${margin}${line}`).join("\n")
      );
    }
    function formatSummaryTable({ rows, totalDurationMs, totals, width = Infinity }) {
      const named = rows.map((row) => ({ ...row, name: formatBreadcrumbLabel(row.segments) }));
      const nameWidth = Math.max(...named.map((row) => row.name.length));
      const durationWidth = Math.max(
        0,
        ...named.filter((row) => row.didNotLoad !== true).map((row) => formatDuration(row.durationMs).length)
      );
      const cells = named.map((row) => ({
        name: row.name,
        outcome: row.didNotLoad === true ? DID_NOT_LOAD_LABEL : [formatDuration(row.durationMs).padStart(durationWidth), formatCounts(row.counts)].join(TABLE_CELL_GAP),
        token: row.didNotLoad === true ? "failedError" : resolveWorstToken(row.counts.worstSeverity)
      }));
      const oneLine = cells.map((cell) => ({
        lead: token(cell.token),
        body: [cell.name.padEnd(nameWidth), cell.outcome].join(TABLE_CELL_GAP)
      }));
      const lines = oneLine.every((line) => gutter + measureWidth(line.body) <= width) ? oneLine : cells.flatMap((cell) => [
        { lead: token(cell.token), body: cell.name },
        { lead: indent(1), body: cell.outcome }
      ]);
      const totalToken = rows.some((row) => row.didNotLoad === true) ? "failedError" : resolveWorstToken(totals.worstSeverity);
      const totalBody = buildCountBody(totals, totalDurationMs);
      const bodyWidth = Math.max(...lines.map((line) => measureWidth(line.body)), measureWidth(totalBody));
      const rule = formatter.paint.rule(formatter.rules.section.repeat(Math.min(gutter + bodyWidth, width)));
      return [
        formatHeading(SUMMARY_HEADING, "kit"),
        rule,
        ...lines.map((line) => `${line.lead}${line.body}`),
        rule,
        `${token(totalToken)}${totalBody}`
      ];
    }
    function indent(depth) {
      return " ".repeat(gutter * depth);
    }
    function inlineGlyph(name) {
      const { text } = formatter.tokens[name];
      return text === "" ? "" : `${text} `;
    }
    function token(name) {
      const { text, width } = formatter.tokens[name];
      return text + " ".repeat(gutter - width);
    }
    function buildCountBody(counts, durationMs) {
      return `${TOTAL_LABEL} ${formatCounts(counts)} (${formatDuration(durationMs)})`;
    }
    return {
      formatBreadcrumb,
      formatBreadcrumbLabel,
      formatCheckLine,
      formatCountLine,
      formatCounts,
      formatFix,
      formatHeading,
      formatHint,
      formatReasonBlock,
      formatSummaryTable,
      indent,
      inlineGlyph,
      token
    };
  }
  function formatBreadcrumbLabel(segments) {
    return segments.map((segment) => segment.text).join(SEGMENT_SEPARATOR);
  }
  function resolveWorstToken(worstSeverity) {
    if (worstSeverity === "error") return "failedError";
    if (worstSeverity === "warn") return "failedWarn";
    if (worstSeverity === "recommend") return "failedRecommend";
    return "passed";
  }
  function resolveDuration(token, durationMs) {
    if (durationMs === void 0 || SKIPPED_TOKENS.has(token)) return void 0;
    return durationMs >= DURATION_FLOOR_MS ? formatDuration(durationMs) : void 0;
  }
  function formatDuration(ms) {
    return `${Math.round(ms)}ms`;
  }

  // src/layout/engine.ts
  var engines = {
    plain: createLayoutEngine(plainFormatter),
    rich: createLayoutEngine(richFormatter)
  };
  var richColorEngine = createLayoutEngine(richColorFormatter);
  var active = engines.rich;
  var activeStyle = "rich";
  var activeColor = false;
  var activeWidth = Infinity;
  function getColor() {
    return activeColor;
  }
  function getLayout() {
    return active;
  }
  function getStyle() {
    return activeStyle;
  }
  function getWidth() {
    return activeWidth;
  }
  function setColor(enabled) {
    activeColor = enabled;
    active = resolveEngine();
  }
  function setStyle(style) {
    activeStyle = style;
    active = resolveEngine();
  }
  function resolveEngine() {
    return activeStyle === "rich" && activeColor ? richColorEngine : engines[activeStyle];
  }

  // src/kits/types.ts
  function isPercentProgress(progress) {
    return progress.type === "percent";
  }

  // src/severity/meetsThreshold.ts
  var SEVERITY_RANK = {
    error: 0,
    warn: 1,
    recommend: 2
  };
  function meetsThreshold(severity, threshold) {
    assertRankedSeverity(severity, "severity");
    assertRankedSeverity(threshold, "severity threshold");
    return SEVERITY_RANK[severity] <= SEVERITY_RANK[threshold];
  }
  function assertRankedSeverity(severity, role) {
    if (!Object.hasOwn(SEVERITY_RANK, severity)) {
      throw new Error(`Unknown ${role} "${severity}". Expected one of: error, warn, recommend.`);
    }
  }

  // src/severity/worseSeverity.ts
  function worseSeverity(current, candidate) {
    if (current === "error" || candidate === "error") return "error";
    if (current === "warn" || candidate === "warn") return "warn";
    if (current === "recommend" || candidate === "recommend") return "recommend";
    return null;
  }

  // src/reporting/reportRdy.ts
  var FIXES_HEADING = "Fixes";
  function renderReportSections(report, options) {
    const fixLocation = options?.fixLocation ?? "end";
    const reportOn = options?.reportOn ?? "recommend";
    const visibleResults = selectReportedResults(report.results, reportOn, options?.quiet === true);
    const results = visibleResults.map((result) => ({ result, lines: renderResult(result, fixLocation) }));
    const fixes = [];
    if (fixLocation === "end") {
      const attributedFixes = collectFixes(visibleResults);
      if (attributedFixes.length > 0) {
        fixes.push(getLayout().formatHeading(FIXES_HEADING, "section"), ...renderFixRecap(attributedFixes));
      }
    }
    const countLine = getLayout().formatCountLine(countResults(report.results), report.durationMs);
    return { results, fixes, countLine };
  }
  function emptyCounts() {
    return {
      passed: 0,
      errors: 0,
      warnings: 0,
      recommendations: 0,
      blocked: 0,
      optional: 0,
      worstSeverity: null
    };
  }
  function countResults(results) {
    const counts = emptyCounts();
    for (const r of results) {
      tallyResult(counts, r);
    }
    return counts;
  }
  function selectVisibleResults(results, reportOn) {
    return retainWithAncestors(results, (result) => meetsThreshold(result.severity, reportOn));
  }
  function mergeCounts(target, source) {
    target.passed += source.passed;
    target.errors += source.errors;
    target.warnings += source.warnings;
    target.recommendations += source.recommendations;
    target.blocked += source.blocked;
    target.optional += source.optional;
    target.worstSeverity = worseSeverity(target.worstSeverity, source.worstSeverity);
  }
  function selectReportedResults(results, reportOn, quiet) {
    const reported = selectVisibleResults(results, reportOn);
    return retainWithAncestors(reported, (result) => result.status !== "passed" || !(quiet || result.quiet));
  }
  function retainWithAncestors(results, isVisible) {
    const visible = [];
    let nearestVisibleDepth = -Infinity;
    for (const result of results.toReversed()) {
      if (!isVisible(result) && nearestVisibleDepth <= result.depth) continue;
      visible.push(result);
      nearestVisibleDepth = result.depth;
    }
    return visible.toReversed();
  }
  function renderResult(result, fixLocation) {
    const isFailed = result.status === "failed";
    const checkLine = getLayout().formatCheckLine({
      token: resolveResultToken(result),
      name: result.name,
      depth: result.depth,
      durationMs: result.durationMs,
      // A failed check's detail is its reason, which the block beneath renders.
      ...!isFailed && result.detail !== null && { detail: result.detail },
      // Only a failure gives the reader a pragma to write, because only a failure names findings.
      ...isFailed && result.id !== null && { checkId: result.id },
      ...result.progress !== null && { progress: formatProgress(result.progress, result.examinedCount) }
    });
    if (!isFailed) return [checkLine];
    return [checkLine, ...getLayout().formatReasonBlock(collectReasons(result, fixLocation === "inline"), result.depth)];
  }
  function collectReasons(result, includeFix) {
    const reasons = [];
    if (result.detail !== null) reasons.push(result.detail);
    if (result.error !== null) reasons.push(`Error: ${result.error.message}`);
    if (includeFix && result.fix !== null) reasons.push(getLayout().formatFix(result.fix));
    return reasons;
  }
  function collectFixes(results) {
    return results.flatMap(
      (result) => result.status === "failed" && result.fix !== null ? { fix: result.fix, name: result.name, severity: result.severity } : []
    );
  }
  function renderFixRecap(fixes) {
    return fixes.flatMap((entry) => [
      getLayout().formatCheckLine({ token: resolveWorstToken(entry.severity), name: entry.name }),
      ...getLayout().formatReasonBlock([getLayout().formatFix(entry.fix)])
    ]);
  }
  function resolveResultToken(result) {
    if (result.status === "passed") return "passed";
    if (result.status === "skipped") {
      return result.skipReason === "precondition" ? "blockedPrecondition" : "skippedOptional";
    }
    return resolveWorstToken(result.severity);
  }
  function formatProgress(progress, examinedCount) {
    if (isPercentProgress(progress)) {
      return `${progress.percent}%`;
    }
    if (progress.count === 0 && examinedCount !== null) {
      return `${pluralizeWithCount(examinedCount, "file")} examined`;
    }
    return `${progress.passedCount} of ${progress.count}`;
  }
  function tallyResult(counts, result) {
    if (result.status === "passed") {
      counts.passed++;
      return;
    }
    if (result.status === "failed") {
      if (result.severity === "error") counts.errors++;
      else if (result.severity === "warn") counts.warnings++;
      else counts.recommendations++;
      counts.worstSeverity = worseSeverity(counts.worstSeverity, result.severity);
      return;
    }
    if (result.skipReason === "precondition") counts.blocked++;
    else counts.optional++;
  }

  // src/reporting/formatCombinedSummary.ts
  function formatCombinedSummary(rows) {
    return getLayout().formatSummaryTable({
      rows,
      totals: aggregateCounts(rows),
      totalDurationMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
      width: getWidth()
    }).join("\n");
  }
  function aggregateCounts(rows) {
    const totals = emptyCounts();
    for (const row of rows) {
      mergeCounts(totals, row.counts);
    }
    return totals;
  }

  // src/schemas/reportSchemaVersion.ts
  var SCHEMA_VERSION = 2;

  // src/reporting/formatJsonReport.ts
  function formatJsonReport(kitInputs, options) {
    const { failOn, reportOn, detail, warnings } = options;
    const kits = [];
    const aggregates = [];
    for (const input of kitInputs) {
      if ("error" in input) {
        kits.push(input);
        continue;
      }
      const aggregate = aggregateKit(input, detail);
      kits.push(aggregate.entry);
      aggregates.push(aggregate);
    }
    const totals = emptyCounts();
    let totalDurationMs = 0;
    for (const aggregate of aggregates) {
      mergeCounts(totals, aggregate.counts);
      totalDurationMs += aggregate.durationMs;
    }
    const everyKitRan = aggregates.length === kits.length;
    const report = {
      schemaVersion: SCHEMA_VERSION,
      readyupVersion: CAPTURED_READYUP_VERSION,
      passed: everyKitRan && aggregates.every(({ entry }) => entry.passed),
      ...splitCounts(totals),
      ...failOn !== void 0 && { failOn },
      ...reportOn !== void 0 && { reportOn },
      detail,
      durationMs: Math.round(totalDurationMs),
      ...warnings !== void 0 && warnings.length > 0 && { warnings },
      kits
    };
    return JSON.stringify(report);
  }
  function aggregateKit(input, detail) {
    const counts = emptyCounts();
    let durationMs = 0;
    const checklists = input.entries.map(({ name, report }) => {
      const checklistCounts = countResults(report.results);
      mergeCounts(counts, checklistCounts);
      durationMs += report.durationMs;
      return {
        name,
        passed: report.passed,
        ...splitCounts(checklistCounts),
        durationMs: Math.round(report.durationMs),
        ...buildDetailTree(report.results, input.reportOn, detail)
      };
    });
    const entry = {
      name: input.name,
      ...input.origin !== void 0 && { origin: input.origin },
      ...input.compiledWith !== void 0 && { compiledWith: input.compiledWith },
      passed: checklists.every((checklist) => checklist.passed),
      ...splitCounts(counts),
      failOn: input.failOn,
      reportOn: input.reportOn,
      durationMs: Math.round(durationMs),
      checklists
    };
    return { entry, counts, durationMs };
  }
  function splitCounts(counts) {
    const { worstSeverity, ...numeric } = counts;
    return worstSeverity === null ? { counts: numeric } : { counts: numeric, worstSeverity };
  }
  function buildDetailTree(results, reportOn, detail) {
    const visibleResults = selectVisibleResults(results, reportOn);
    const checks = detail === "summary" ? buildSummaryEntries(visibleResults) : buildCheckEntries(visibleResults, 0, 0).entries;
    return checks.length > 0 ? { checks } : {};
  }
  function buildSummaryEntries(results) {
    return results.filter((result) => result.status === "failed").map((result) => {
      const entry = {
        name: result.name,
        status: result.status,
        ok: result.ok,
        severity: result.severity,
        durationMs: Math.round(result.durationMs)
      };
      if (result.id !== null) entry.id = result.id;
      if (result.fix !== null) entry.fix = result.fix;
      return entry;
    });
  }
  function buildCheckEntries(results, startIndex, expectedDepth) {
    const entries = [];
    let index = startIndex;
    while (index < results.length) {
      const result = results[index];
      if (result === void 0) break;
      const depth = result.depth;
      if (depth < expectedDepth) break;
      index++;
      const { entries: children, nextIndex } = buildCheckEntries(results, index, depth + 1);
      index = nextIndex;
      entries.push(buildCheckEntry(result, children));
    }
    return { entries, nextIndex: index };
  }
  function buildCheckEntry(result, children) {
    const entry = {
      name: result.name,
      status: result.status,
      ok: result.ok,
      severity: result.severity,
      durationMs: Math.round(result.durationMs)
    };
    if (result.id !== null) entry.id = result.id;
    if (result.status === "skipped") entry.skipReason = result.skipReason;
    if (result.detail !== null) entry.detail = result.detail;
    if (result.status === "failed" && result.fix !== null) entry.fix = result.fix;
    if (result.error !== null) entry.error = result.error.message;
    if (result.progress !== null) entry.progress = result.progress;
    if (result.examinedCount !== null) entry.examinedCount = result.examinedCount;
    if (children.length > 0) entry.checks = children;
    return entry;
  }

  // src/reporting/formatRunVerdict.ts
  var SEVERITY_ORDER = ["error", "warn", "recommend"];
  function formatRunVerdict({ kitThresholds, missingKitCount, passed, withheld }) {
    const layout = getLayout();
    const lines = [];
    if (withheld !== void 0 && withheld.count > 0) {
      const subject = withheld.count === 1 ? "1 failing check is not shown" : `${withheld.count} failing checks are not shown`;
      const pronoun = withheld.count === 1 ? "it" : "them";
      lines.push(layout.formatHint(`${subject}; rerun with --report-on ${withheld.showAt} to show ${pronoun}`));
    }
    if (missingKitCount > 0) {
      lines.push(
        `${layout.token("failedError")}Run incomplete: ${pluralizeWithCount(missingKitCount, "kit")} did not run`
      );
    } else {
      const verdict = passed ? `${layout.token("passed")}Run passed` : `${layout.token("failedError")}Run failed`;
      lines.push(kitThresholds.length > 0 ? `${verdict} (fail-on: ${describeThresholds(kitThresholds)})` : verdict);
    }
    return lines.join("\n");
  }
  function describeThresholds(kitThresholds) {
    const distinct = SEVERITY_ORDER.filter((severity) => kitThresholds.some(({ failOn }) => failOn === severity));
    if (distinct.length === 1) return distinct.join("");
    return distinct.map((severity) => {
      const kitNames = kitThresholds.filter(({ failOn }) => failOn === severity).map(({ kitName }) => kitName);
      return `${severity} for ${kitNames.join(", ")}`;
    }).join("; ");
  }

  // presentation/src/deployKit.ts
  var DEPLOY_KIT = {
    name: "deploy",
    command: "rdy run deploy",
    conditions: [
      { id: "build", label: "The build output is present", on: false },
      { id: "env", label: "NODE_ENV is set", on: false }
    ],
    checklists: [
      {
        name: "deploy",
        ms: 0,
        checks: [
          {
            name: "package.json exists",
            severity: "error",
            checks: [
              {
                name: "build output present",
                severity: "error",
                when: "build",
                failDetail: "dist/index.js not found",
                fix: "Run the build before deploying",
                checks: [
                  { name: "bundle under 500 kB", severity: "error" },
                  { name: "source maps excluded", severity: "warn" }
                ]
              }
            ]
          },
          {
            name: "NODE_ENV is set",
            severity: "warn",
            when: "env",
            failDetail: "NODE_ENV has no value in the environment",
            fix: "Set NODE_ENV before deploying"
          },
          { name: "base image is pinned", severity: "warn", na: "no Dockerfile in this project" }
        ]
      }
    ]
  };

  // presentation/src/renderKit.ts
  var FAIL_ON = "error";
  var REPORT_ON = "recommend";
  function renderKit(kit, env) {
    const previousColor = getColor();
    const previousStyle = getStyle();
    setStyle("rich");
    setColor(true);
    try {
      return composeKit(kit, env);
    } finally {
      setStyle(previousStyle);
      setColor(previousColor);
    }
  }
  function renderDeployRun() {
    return renderKit(DEPLOY_KIT, buildDefaultEnvironment(DEPLOY_KIT)).lines;
  }
  function buildDefaultEnvironment(kit) {
    return Object.fromEntries(kit.conditions.map((condition) => [condition.id, condition.on]));
  }
  function buildSegments(kit, checklist) {
    const segments = [];
    if (kit.origin !== void 0) {
      const { source } = kit.origin;
      const version = kit.origin.version === void 0 ? "" : `@${kit.origin.version}`;
      const sourceSegment = source.startsWith("npm:") ? { role: "sourcePackage", text: `${source.slice("npm:".length)}${version}` } : { role: "sourceRemote", text: `${source}${version}` };
      segments.push(sourceSegment, { role: "kit", text: kit.name });
    }
    if (kit.checklists.length > 1) segments.push({ role: "checklist", text: checklist.name });
    return segments;
  }
  function buildResult(check, depth, status) {
    const base = {
      name: check.name,
      id: check.id ?? null,
      severity: check.severity,
      quiet: false,
      error: null,
      progress: resolveProgress(check, status),
      examinedCount: check.findings === true ? 0 : null,
      durationMs: check.ms ?? 0,
      depth
    };
    if (status === "pass") return { ...base, status: "passed", ok: true, detail: check.detail ?? null };
    if (status === "skip") return { ...base, status: "skipped", ok: null, skipReason: "n/a", detail: check.na ?? null };
    if (status === "blocked") return { ...base, status: "skipped", ok: null, skipReason: "precondition", detail: null };
    const detail = check.sites === void 0 ? check.failDetail ?? null : check.sites.join(", ");
    return { ...base, status: "failed", ok: false, detail, fix: check.fix ?? null };
  }
  function composeKit(kit, env) {
    const layout = getLayout();
    const lines = [{ at: 0, printed: false, text: `$ ${kit.command}` }];
    const entries = [];
    const summaryRows = [];
    let step = 0;
    function print(at, text) {
      for (const line of text.split("\n")) lines.push({ at, printed: true, text: line });
    }
    for (const [index, checklist] of kit.checklists.entries()) {
      const checks = evaluateChecklist(checklist, env, step);
      step += checks.length;
      const headAt = index === 0 ? 0 : step - checks.length;
      const segments = buildSegments(kit, checklist);
      if (index > 0) print(headAt, "");
      if (segments.length > 0) print(headAt, layout.formatBreadcrumb(segments, "kit"));
      const results = checks.map(({ result }) => result);
      const report = {
        results,
        passed: results.every((result) => result.status !== "failed" || !meetsThreshold(result.severity, FAIL_ON)),
        durationMs: checklist.ms
      };
      const sections = renderReportSections(report, { reportOn: REPORT_ON });
      const stepByResult = new Map(checks.map(({ at, result }) => [result, at]));
      for (const { result, lines: resultLines } of sections.results) {
        print(stepByResult.get(result) ?? headAt, resultLines.join("\n"));
      }
      step++;
      print(step, [...sections.fixes, sections.countLine].join("\n"));
      entries.push({ name: checklist.name, report });
      summaryRows.push({ counts: countResults(report.results), durationMs: report.durationMs, segments });
    }
    step++;
    const verdictAt = step;
    if (summaryRows.length > 1) {
      print(verdictAt, "");
      print(verdictAt, formatCombinedSummary(summaryRows));
    }
    const passed = entries.every(({ report }) => report.passed);
    const exit = passed ? 0 : 1;
    print(verdictAt, "");
    print(
      verdictAt,
      formatRunVerdict({
        kitThresholds: [{ kitName: kit.name, failOn: FAIL_ON }],
        missingKitCount: 0,
        passed,
        withheld: void 0
      })
    );
    lines.push({ at: verdictAt, printed: false, text: `exit ${exit}` });
    const json = formatJsonReport(
      [
        {
          name: kit.name,
          ...kit.origin !== void 0 && { origin: kit.origin },
          ...kit.compiledWith !== void 0 && { compiledWith: kit.compiledWith },
          entries,
          failOn: FAIL_ON,
          reportOn: REPORT_ON
        }
      ],
      { detail: "full" }
    );
    return { exit, exitAt: verdictAt, json: indentJson(json), lines, steps: verdictAt };
  }
  function evaluateChecklist(checklist, env, stepBefore) {
    const evaluated = [];
    function visit(check, depth, isBlocked) {
      const status = resolveStatus(check, env, isBlocked);
      evaluated.push({ at: stepBefore + evaluated.length + 1, result: buildResult(check, depth, status) });
      const children = check.checks ?? [];
      for (const child of children) visit(child, depth + 1, status !== "pass");
    }
    for (const check of checklist.checks) visit(check, 0, false);
    return evaluated;
  }
  function indentJson(json) {
    const parsed = JSON.parse(json);
    return JSON.stringify(parsed, void 0, 2);
  }
  function resolveProgress(check, status) {
    if (status === "blocked") return null;
    if (check.examined !== void 0) {
      const failingCount = status === "pass" ? 0 : new Set(check.sites?.map((site) => site.replace(/:\d+$/u, ""))).size;
      return { type: "fraction", passedCount: check.examined - failingCount, count: check.examined };
    }
    if (check.progress === void 0) return null;
    return { type: "fraction", passedCount: check.progress[0], count: check.progress[1] };
  }
  function resolveStatus(check, env, isBlocked) {
    if (isBlocked) return "blocked";
    if (check.na !== void 0) return "skip";
    return check.when === void 0 || env[check.when] === true ? "pass" : check.severity;
  }

  // presentation/src/toHtml.ts
  var ESCAPE = "\x1B";
  var SGR_SEQUENCE = new RegExp(String.raw`${ESCAPE}\[([\d;]*)m`, "gu");
  var COLOR_CLASSES = /* @__PURE__ */ new Map([
    [31, "sgr-red"],
    [32, "sgr-green"],
    [33, "sgr-yellow"],
    [90, "sgr-gray"]
  ]);
  function escapeHtml(text) {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  }
  function toHtml(text) {
    const state = { bold: false, color: void 0, dim: false };
    let html = "";
    let position = 0;
    for (const match of text.matchAll(SGR_SEQUENCE)) {
      html += wrapRun(text.slice(position, match.index), state);
      applyParameters(state, match[1] ?? "");
      position = match.index + match[0].length;
    }
    return html + wrapRun(text.slice(position), state);
  }
  function applyParameters(state, parameters) {
    const codes = parameters.split(";").map(Number);
    for (const code of codes) {
      switch (code) {
        case 0:
          state.bold = false;
          state.color = void 0;
          state.dim = false;
          break;
        case 1:
          state.bold = true;
          break;
        case 2:
          state.dim = true;
          break;
        case 22:
          state.bold = false;
          state.dim = false;
          break;
        case 39:
          state.color = void 0;
          break;
        default:
          state.color = COLOR_CLASSES.get(code) ?? state.color;
      }
    }
  }
  function wrapRun(run, state) {
    if (run === "") return "";
    const classes = [state.bold && "sgr-bold", state.color, state.dim && "sgr-dim"].filter(
      (name) => typeof name === "string"
    );
    const escaped = escapeHtml(run);
    return classes.length > 0 ? `<span class="${classes.join(" ")}">${escaped}</span>` : escaped;
  }
  return __toCommonJS(deck_exports);
})();
