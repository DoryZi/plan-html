// Answer/added/finish-line state: the single source of truth for everything the
// user has done in the deck. Restored from server-injected SAVED or localStorage,
// autosaved back (localStorage immediately + POST /save debounced).
//
// `createStore(plan, saved)` returns a mutable store object the rest of the deck
// shares. The predicate helpers (satisfied / hasQuestion / dismissed) are pure
// over a store and are exported standalone too so they can be unit-tested.

const EMPTY_ADDED = () => ({ intents: [], boundaries: [], decisions: [], steps: [] });

/** Is this card struck out (ticked off)? */
export const isDismissed = (store, id) => Boolean((store.answers[id] || {}).dismissed);

/** byId across PLAN sections and user-added buckets. */
export const findCard = (store, id) =>
  (store.plan.boundaries || []).find((d) => d.id === id) ||
  (store.plan.intents || []).find((d) => d.id === id) ||
  (store.plan.decisions || []).find((d) => d.id === id) ||
  store.added.boundaries.find((d) => d.id === id) ||
  store.added.intents.find((d) => d.id === id) ||
  store.added.decisions.find((d) => d.id === id) ||
  store.added.steps.find((d) => d.id === id);

/** Has the card been answered (choice / free text / edit / authored title / dismissed)? */
export const isSatisfied = (store, id) => {
  if (isDismissed(store, id)) return true;
  const card = findCard(store, id);
  if (card && card.userAdded && (card.title || "").trim()) return true;
  const a = store.answers[id] || {};
  return Boolean(a.choice || (a.answer && a.answer.trim()) ||
    (a.edit && a.edit.trim()));
};

/** Does the card carry an open question for the agent (live-pending or queued)? */
export const hasQuestion = (store, id) => {
  if (isDismissed(store, id)) return false;
  if (store.pendingAsk[id] != null) return true;
  const a = store.answers[id] || {};
  return Boolean(a.question && a.question.trim());
};

export const createStore = (plan, saved) => {
  const store = {
    plan,
    saved,
    round: plan.round || 1,
    lsKey: "plan-html:" + (plan.slug || plan.title || "plan"),
    // answers[id] = { choice, answer, question, edit, dismissed, order, grill }
    answers: {},
    // cards the user authored in the browser, merged into their section at render.
    added: EMPTY_ADDED(),
    // editable working copy of the final-verify rows; null until first seeded.
    fvState: null,
    // global requests to the agent for the next round.
    agentActions: { reexplore: false, note: "" },
    // card registry (rebuilt every render) and add-button registry.
    cards: [],
    addBtns: [],
    // cards awaiting a live agent reply: cardId -> { len, text }.
    pendingAsk: {},
  };

  // Bound convenience wrappers around the pure predicates.
  store.ans = (id) => (store.answers[id] = store.answers[id] || {});
  store.byId = (id) => findCard(store, id);
  store.dismissed = (id) => isDismissed(store, id);
  store.satisfied = (id) => isSatisfied(store, id);
  store.hasQuestion = (id) => hasQuestion(store, id);
  store.hasInput = (id) => store.satisfied(id) || store.hasQuestion(id);
  store.saveState = () => ({
    round: store.round,
    answers: store.answers,
    agentActions: store.agentActions,
    added: store.added,
    fvState: store.fvState,
  });

  return store;
};

/** Restore prior state into the store from SAVED (server) or localStorage. */
export const restore = (store) => {
  let src = store.saved;
  if (!src) {
    try { src = JSON.parse(localStorage.getItem(store.lsKey) || "null"); }
    catch (e) { console.warn("localStorage restore failed", e); src = null; }
  }
  if (!src || !src.answers) return;
  store.answers = src.answers;
  if (src.added) store.added = { ...EMPTY_ADDED(), ...src.added };
  const stale = (src.round || 1) < store.round;
  // a new round means the agent rebuilt the plan (incl. finalVerify) — let it
  // reseed from PLAN; only carry the edited finish-line rows within a round
  if (src.fvState && !stale) store.fvState = src.fvState;
  // questions and agent-requests from a previous round were delivered — clear
  // them so they aren't re-sent
  if (stale) {
    Object.values(store.answers).forEach((a) => { delete a.question; });
  } else if (src.agentActions) {
    store.agentActions = { reexplore: false, note: "", ...src.agentActions };
  }
};

/**
 * Build the autosave/persist driver. `onPersist` is called synchronously on
 * every change (used to flip +/- add buttons live). Returns { persist }.
 */
export const createPersist = (store, onPersist) => {
  let saveTimer = null;
  const saveEl = () => document.getElementById("savestate");
  const persist = () => {
    try { localStorage.setItem(store.lsKey, JSON.stringify(store.saveState())); }
    catch (e) { console.warn("localStorage save failed", e); }
    if (onPersist) onPersist();
    saveEl().textContent = "Saving…"; saveEl().className = "savestate";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const r = await fetch("/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(store.saveState()),
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
        saveEl().textContent = "Saved ✓"; saveEl().className = "savestate ok";
      } catch {
        // server gone (e.g. timed out) — answers still live in localStorage
        saveEl().textContent = "Saved locally only";
        saveEl().className = "savestate warn";
      }
    }, 500);
  };
  return { persist };
};

export const titleOf = (d) => d.title || d.id;
