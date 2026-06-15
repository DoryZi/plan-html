import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDismissed, isSatisfied, hasQuestion, findCard, titleOf,
} from "../../src/state.js";

// minimal store shape the pure predicates read
const makeStore = (over = {}) => ({
  plan: { intents: [{ id: "i1", title: "Intent one" }], decisions: [], boundaries: [] },
  added: { intents: [], boundaries: [], decisions: [], steps: [] },
  answers: {},
  pendingAsk: {},
  ...over,
});

test("titleOf falls back to id", () => {
  assert.equal(titleOf({ title: "T" }), "T");
  assert.equal(titleOf({ id: "x" }), "x");
});

test("findCard locates plan and added cards", () => {
  const store = makeStore({ added: { intents: [{ id: "u1", title: "Mine" }], boundaries: [], decisions: [], steps: [] } });
  assert.equal(findCard(store, "i1").title, "Intent one");
  assert.equal(findCard(store, "u1").title, "Mine");
  assert.equal(findCard(store, "nope"), undefined);
});

test("isDismissed reflects the answer flag", () => {
  const store = makeStore({ answers: { i1: { dismissed: true } } });
  assert.equal(isDismissed(store, "i1"), true);
  assert.equal(isDismissed(store, "other"), false);
});

test("isSatisfied: dismissed counts as satisfied", () => {
  const store = makeStore({ answers: { i1: { dismissed: true } } });
  assert.equal(isSatisfied(store, "i1"), true);
});

test("isSatisfied: a choice, free text, or edit satisfies", () => {
  assert.equal(isSatisfied(makeStore({ answers: { i1: { choice: "approve" } } }), "i1"), true);
  assert.equal(isSatisfied(makeStore({ answers: { i1: { answer: " yes " } } }), "i1"), true);
  assert.equal(isSatisfied(makeStore({ answers: { i1: { edit: "rewrote" } } }), "i1"), true);
  assert.equal(isSatisfied(makeStore(), "i1"), false);
});

test("isSatisfied: a user-added card with a title is satisfied", () => {
  const store = makeStore({ added: { intents: [{ id: "u1", title: "New", userAdded: true }], boundaries: [], decisions: [], steps: [] } });
  assert.equal(isSatisfied(store, "u1"), true);
  const empty = makeStore({ added: { intents: [{ id: "u2", title: "  ", userAdded: true }], boundaries: [], decisions: [], steps: [] } });
  assert.equal(isSatisfied(empty, "u2"), false);
});

test("hasQuestion: queued free-text question and live pendingAsk both count", () => {
  assert.equal(hasQuestion(makeStore({ answers: { i1: { question: "why?" } } }), "i1"), true);
  assert.equal(hasQuestion(makeStore({ pendingAsk: { i1: { len: 0 } } }), "i1"), true);
  assert.equal(hasQuestion(makeStore(), "i1"), false);
});

test("hasQuestion: dismissed card never has an open question", () => {
  const store = makeStore({ answers: { i1: { question: "why?", dismissed: true } } });
  assert.equal(hasQuestion(store, "i1"), false);
});
