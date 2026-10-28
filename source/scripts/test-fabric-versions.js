const assert = require('node:assert/strict');
const { satisfies, compareVersions } = require('../src/lib/game/fabric-versions');
const cases = [
  ['1.21-pre1', '1.21.x', true], ['1-pre1', '1.x', true],
  ['1.21.11', '1.x.x', true], ['1.21.11', '1.21.x.x', true],
  ['1.22-pre1', '1.21.x', false], ['1.21', '1.21.0.x', true],
  ['01.21.11', '1.21.x', true],
  ['1.0.1-alpha.01', '>1.0.1-alpha.2', true],
  ['1.21.11', '~1.21-', true], ['1.21', '~1.21-', true],
  ['1.21-pre1', '~1.21-', true], ['1.20.6', '~1.21-', false],
  ['1.22-', '~1.21-', false], ['1.22', '~1.21-', false],
  ['1.21.11', '~1.21.10', true], ['1.21.9', '~1.21.10', false],
  ['1.21.11', '~1.21.11+build', true], ['1.21.11-pre1', '~1.21.11', false],
  ['1.21.11-beta.10', '>=1.21.11-beta.2', true],
  ['1.21.11', '>=1.21.11-pre1', true], ['1.21.11-pre1', '>=1.21.11', false],
  ['0.19.5', '>=0.18.4', true], ['21', '>=21', true], ['17', '>=21', false],
  ['1.21.11', '>=1.21 <1.22-', true], ['1.22-pre1', '>=1.21 <1.22-', false],
  ['1.21.11', '1.21.x', true], ['1.21.11', '=1.21.*', true], ['1.22', '1.21.x', false],
  ['1.21.11', '^1.21-', true], ['2.0', '^1.21-', false],
  ['1.0.1', '~1', true], ['1.1', '~1', false],
  ['1.21.11', ['~1.20-', '~1.21-'], true],
  ['release', '>=release', true], ['snapshot', '>=release', false],
  ['release', '>release', false], ['1.21.11', '*', true],
  ['0.8.7+mc1.21.11', '=0.8.7+other-build', true]
];
for (const [version, predicate, expected] of cases) {
  assert.equal(satisfies(version, predicate), expected, `${version} ${JSON.stringify(predicate)}`);
}
assert.ok(compareVersions('1.21-', '1.21-pre1') < 0);
assert.ok(compareVersions('1.21-pre1', '1.21') < 0);
assert.equal(compareVersions('1.21.0', '1.21'), 0);
console.log(`PASS ${cases.length} Fabric version predicates and prerelease ordering`);
module.exports = { cases };
