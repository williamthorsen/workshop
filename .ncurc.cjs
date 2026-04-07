module.exports = {
  filterResults,
  reject,
};

/**
 * Returns true if the upgraded version of the package should be included in available upgrades.
 *
 * @param {string} packageName
 * @param {VersioningMetadata} versioningMetadata
 * @returns {boolean} - true if the package should be included
 */
function filterResults(packageName, versioningMetadata) {
  if (packageName === '@types/node' && Number.parseInt(versioningMetadata.upgradedVersionSemver.major) > 24) {
    return false;
  }

  return true;
}

/**
 * Returns true if no check for available upgrades should be made for the package.
 *
 * @param {string} _packageName
 * @param {SemVer[]} versionRanges
 * @returns {boolean} - true if the package should be excluded
 *
 * @todo: When can `versionRanges` can have more than one element?
 */
function reject(_packageName, versionRanges) {
  const [versionRange] = versionRanges;

  if (!versionRange) return false;

  return false;
}

// region | Types
/**
 * @typedef {Object} SemVer
 * @property {string} semver
 * @property {string} major
 * @property {string} minor
 * @property {string} patch
 */

/**
 * @typedef {Object} VersioningMetadata
 * @property {string} currentVersion
 * @property {SemVer[]} currentVersionSemver
 * @property {string} upgradedVersion
 * @property {SemVer} upgradedVersionSemver
 */
// endregion | Types
