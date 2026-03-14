var assert = require("assert");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.log("  FAIL: " + name);
    console.log("    " + e.message);
  }
}

function approxEqual(actual, expected, tolerance) {
  tolerance = tolerance || 0.001;
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    "Expected ~" + expected + " but got " + actual,
  );
}

function summary() {
  console.log(
    "\n" +
      (passed + failed) +
      " tests: " +
      passed +
      " passed, " +
      " " +
      failed +
      " failed\n",
  );
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = {
  test: test,
  approxEqual: approxEqual,
  summary: summary,
  assert: assert,
};
