import { strict as assert } from "node:assert";
import { test } from "node:test";
import { applyBasisPoints, formatCents, shippingFor } from "../src/services/pricing";

test("applies basis points with half-up rounding", () => {
  assert.equal(applyBasisPoints(1000, 825), 83);
});

test("free shipping at the threshold", () => {
  assert.equal(shippingFor(7500), 0);
  assert.equal(shippingFor(100), 599);
});

test("formats cents", () => {
  assert.equal(formatCents(1999), "$19.99");
});
