import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload } from "../../src/payload.js";

// fake store with just what buildPayload reads
const makeStore = (cards, answers = {}, fvState = [], over = {}) => ({
  round: 1,
  cards,
  answers,
  fvState,
  agentActions: { reexplore: false, note: "  go  " },
  dismissed: (id) => Boolean((answers[id] || {}).dismissed),
  ...over,
});

test("emits cards in the passed DOM order and assigns priority", () => {
  const cards = [
    { id: "a", kind: "intent", data: { id: "a", title: "A" } },
    { id: "b", kind: "intent", data: { id: "b", title: "B" } },
  ];
  const p = buildPayload(makeStore(cards), "send-round", ["b", "a"]);
  assert.deepEqual(p.cards.map((c) => c.id), ["b", "a"]);
  assert.equal(p.cards[0].priority, 0);
  assert.equal(p.cards[1].priority, 1);
});

test("trims the agentActions note", () => {
  const p = buildPayload(makeStore([]), "send-round", []);
  assert.equal(p.agentActions.note, "go");
});

test("struck-out cards are dropped from the payload entirely", () => {
  const cards = [
    { id: "a", kind: "intent", data: { id: "a", title: "A" } },
    { id: "b", kind: "decision", data: { id: "b", title: "B" } },
  ];
  const p = buildPayload(makeStore(cards, { b: { dismissed: true } }), "send-round", ["a", "b"]);
  assert.deepEqual(p.cards.map((c) => c.id), ["a"]);
});

test("userAdded cards carry their full draft", () => {
  const cards = [{ id: "u1", kind: "intent", data: { id: "u1", title: "New", userAdded: true, intent: "I want Y" } }];
  const p = buildPayload(makeStore(cards), "send-round", ["u1"]);
  assert.equal(p.cards[0].userAdded, true);
  assert.equal(p.cards[0].draft.intent, "I want Y");
});

test("agent step edited in place rides back as userEdited with a draft", () => {
  const cards = [{ id: "step-0", kind: "step", data: { id: "step-0", title: "S", description: "edited" } }];
  const p = buildPayload(makeStore(cards), "send-round", ["step-0"]);
  assert.equal(p.cards[0].userEdited, true);
  assert.equal(p.cards[0].draft.description, "edited");
});

test("grill answers are paired with their question text", () => {
  const cards = [{ id: "i1", kind: "intent", data: { id: "i1", title: "I", agentQuestions: [{ id: "who", q: "who uses it?" }] } }];
  const p = buildPayload(makeStore(cards, { i1: { grill: { who: "just me" } } }), "send-round", ["i1"]);
  assert.deepEqual(p.cards[0].grill, [{ id: "who", q: "who uses it?", answer: "just me" }]);
});

test("finalVerify drops fully-empty rows, keeps partial ones", () => {
  const fv = [
    { intent: "i1", method: "e2e", command: "run", expected: "ok" },
    { intent: "", method: "", command: "", expected: "" },
    { intent: "", method: "unit", command: "", expected: "" },
  ];
  const p = buildPayload(makeStore([], {}, fv), "send-round", []);
  assert.equal(p.finalVerify.length, 2);
  assert.deepEqual(p.finalVerify.map((v) => v.method), ["e2e", "unit"]);
});
