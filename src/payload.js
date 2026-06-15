// Round payload builder: turns the current store + on-screen order into the
// JSON shipped to the agent on "Send to agent" / "Finalize". Kept separate and
// near-pure (it reads the DOM only to recover the user's current priority order)
// so its shape is easy to reason about and unit-test against the server.

import { titleOf } from "./state.js";

/**
 * Build the round payload. `domOrderIds` is the list of card ids in their
 * current top-to-bottom on-screen order (top = highest priority); the caller
 * passes it so this stays testable without a live DOM.
 */
export const buildPayload = (store, action, domOrderIds) => {
  const ordered = [...store.cards].sort(
    (a, b) => domOrderIds.indexOf(a.id) - domOrderIds.indexOf(b.id));
  return {
    action,
    round: store.round,
    agentActions: {
      reexplore: store.agentActions.reexplore,
      note: store.agentActions.note.trim(),
    },
    // struck-out cards are removed from the plan — drop them from the round
    // entirely (agent's cards become "absent = removed"; user-added cards
    // never reach the agent at all)
    cards: ordered.filter((c) => !store.dismissed(c.id)).map((c, priority) => {
      const a = store.answers[c.id] || {};
      const base = {
        id: c.id, kind: c.kind, title: titleOf(c.data),
        status: c.data.status || null,
        priority,                               // 0 = top of its section
        choice: a.choice || null,
        answer: (a.answer || "").trim(),
        question: (a.question || "").trim(),
        edit: (a.edit || "").trim() || null,
      };
      // cards the user authored in the browser carry their full draft so the
      // agent can validate/complete them next round
      if (c.data.userAdded) { base.userAdded = true; base.draft = c.data; }
      // step cards are editable in place — always carry the current field
      // state so the agent keeps the user's wording (their version is
      // authoritative). userEdited flags an agent step the user changed.
      if (c.kind === "step") {
        base.draft = c.data;
        if (!c.data.userAdded) base.userEdited = true;
      }
      // answers to the agent's grill/clarifying questions on this card, paired
      // with the question text so the agent reads them in context
      if (c.data.agentQuestions && c.data.agentQuestions.length) {
        const g = (a.grill || {});
        base.grill = c.data.agentQuestions.map((gq, qi) => {
          const qid = (typeof gq === "object" ? gq.id : null) || `q${qi}`;
          const qtext = typeof gq === "object" ? gq.q : gq;
          return { id: qid, q: qtext, answer: (g[qid] || "").trim() };
        });
      }
      return base;
    }),
    // the user's edited finish-line rows (authoritative); empty rows dropped
    finalVerify: (store.fvState || []).filter((v) =>
      [v.intent, v.method, v.command, v.expected].some((x) => (x || "").trim())),
  };
};
