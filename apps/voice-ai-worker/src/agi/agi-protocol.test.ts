import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgiHandshake, parseAgiResponse } from "./agi-protocol";

test("parseAgiHandshake — typical FastAGI env headers", () => {
  const buf = [
    "agi_network: yes",
    "agi_request: agi://127.0.0.1:4573",
    "agi_channel: PJSIP/inbound-00000001",
    "agi_language: en",
    "agi_callerid: 998901234567",
    "agi_calleridname: <unknown>",
    "agi_uniqueid: 1700000000.42",
    "agi_context: acoustic-ai-ivr",
    "agi_extension: s",
    "agi_priority: 1",
    "agi_dnid: 712001020",
    "", // terminator
    "",
  ].join("\n");
  const parsed = parseAgiHandshake(buf);
  assert.ok(parsed, "headers should parse");
  assert.equal(parsed!.env.channel, "PJSIP/inbound-00000001");
  assert.equal(parsed!.env.callerIdNum, "998901234567");
  assert.equal(parsed!.env.uniqueId, "1700000000.42");
  assert.equal(parsed!.env.context, "acoustic-ai-ivr");
  assert.equal(parsed!.env.dnid, "712001020");
  assert.equal(parsed!.rest, "");
});

test("parseAgiHandshake — returns null when terminator missing", () => {
  const buf = "agi_channel: PJSIP/inbound-1\nagi_uniqueid: 123";
  assert.equal(parseAgiHandshake(buf), null);
});

test("parseAgiResponse — STREAM FILE success", () => {
  const res = parseAgiResponse("200 result=0 endpos=12345");
  assert.equal(res.code, 200);
  assert.equal(res.result, "0");
  assert.equal(res.data, "endpos=12345");
});

test("parseAgiResponse — 5xx hangup", () => {
  const res = parseAgiResponse("511 Command Not Permitted on a dead channel");
  assert.equal(res.code, 511);
  assert.equal(res.result, ""); // no result= token; we still return parsed code
});

test("parseAgiResponse — RECORD FILE with dtmf", () => {
  const res = parseAgiResponse("200 result=35 (timeout) endpos=80000");
  assert.equal(res.code, 200);
  assert.equal(res.result, "35");
  assert.ok(res.data?.includes("endpos"));
});
