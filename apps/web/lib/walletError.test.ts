import assert from "node:assert/strict";
import { test } from "node:test";
import { BaseError } from "viem";
import { errorText, isRejection, UserError } from "./walletError.ts";

const quiet = (run: () => void) => {
  const log = console.error;
  console.error = () => {};
  try {
    run();
  } finally {
    console.error = log;
  }
};

test("a plain provider rejection is neutral, not [object Object]", () => {
  const error = { code: 4001, message: "User rejected the request." };
  assert.equal(isRejection(error), true);
  assert.equal(errorText(error), "Request cancelled in your wallet.");
});

test("a rejection wrapped by a library is still a rejection", () => {
  const error = new BaseError("send failed", {
    cause: Object.assign(new Error("denied"), { code: 4001 }),
  });
  assert.equal(isRejection(error), true);
});

test("our own messages are shown as written", () => {
  assert.equal(errorText(new UserError("Buy failed.")), "Buy failed.");
});

test("gas shortage is named", () => {
  assert.match(
    errorText({ code: -32000, message: "insufficient funds for gas * price" }),
    /Not enough ETH/,
  );
});

test("an open wallet request is named", () => {
  assert.match(errorText({ code: -32002 }), /already open/);
});

test("raw library text never reaches the user", () => {
  quiet(() => {
    const raw = new BaseError("reverted 0x095ea7b3 viem@2.58.4");
    assert.equal(errorText(raw), "The request failed. Please try again.");
    assert.equal(errorText("boom"), "The request failed. Please try again.");
  });
});
