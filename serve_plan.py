#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Serve an interactive plan deck and block until the user sends a round.

Used by the /plan-html skill. Renders ``plan.json`` into the interactive
``templates/deck.html`` template, opens it in the user's browser, serves it on
``127.0.0.1`` at a random free port, and *blocks* until the user clicks
"Send to agent" or "Finalize plan" in the browser. Their answers arrive as
JSON, get printed to stdout (the only thing on stdout — logs go to stderr),
and the server shuts down.

Persistence: every change the user makes in the deck is autosaved via
``POST /save`` to ``answers.json`` next to the plan file. On startup, any
existing ``answers.json`` is injected back into the deck, so an interruption
(closed tab, killed server, timeout, reboot) never loses answers. On timeout
the autosaved state is printed instead of null, so the agent can resume.

This is push, not poll: the process waits on a real HTTP request, it does not
loop on a timer. The only bounded wait is an overall timeout so a closed tab
never hangs the agent's session.

Usage:
    uv run --directory <skill-dir> python serve_plan.py \\
        --plan /abs/path/to/plan.json [--timeout 1800]

Output contract (stdout is exactly one JSON line):
    User sent a round / finalized:
        {"action":"send-round"|"finalize","round":N,"cards":[...]}
    Timeout with autosaved partial answers:
        {"action":"timeout","timedOut":true,"saved":{...}}   (exit code 1)
    Timeout with nothing saved:
        {"action":"timeout","timedOut":true,"saved":null}    (exit code 1)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import signal
import socket
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="[plan-html] %(message)s",
)
log = logging.getLogger("plan-html")

TEMPLATE = Path(__file__).resolve().parent / "templates" / "deck.html"


def answers_path_for(plan_path: Path) -> Path:
    """Locate the autosave file that sits next to the plan file.

    Named after the plan file (``<stem>.answers.json``) rather than a bare
    ``answers.json`` so two plans sharing a directory (e.g. several in /tmp)
    never collide and restore each other's stale answers.

    :param plan_path: Resolved path to ``plan.json``.
    :returns: Path to the sibling ``<stem>.answers.json``.
    """
    return plan_path.parent / f"{plan_path.stem}.answers.json"


def load_saved_answers(path: Path) -> dict | None:
    """Read previously autosaved answers, if any.

    :param path: The ``answers.json`` path.
    :returns: The parsed object, or ``None`` if absent or unreadable.
    """
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        log.warning("could not read saved answers (%s) — starting fresh: %s", path, exc)
        return None


def save_answers_atomic(path: Path, data: dict) -> None:
    """Write the answers file atomically (temp file + rename).

    :param path: The ``answers.json`` destination.
    :param data: The answers object to persist.
    :raises OSError: if the write or rename fails.
    """
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".answers-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp_name, path)
    except OSError:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def round_to_answers(round_payload: dict) -> dict:
    """Convert a submitted round into the autosave shape the deck restores from.

    :param round_payload: ``{"action", "round", "cards": [...]}`` from /submit.
    :returns: ``{"round": N, "answers": {id: {choice, answer, question, edit}}}``.
    """
    answers: dict = {}
    for idx, card in enumerate(round_payload.get("cards") or []):
        entry = {k: card[k] for k in ("choice", "answer", "question", "edit")
                 if card.get(k)}
        if card.get("dismissed"):
            entry["dismissed"] = True
        # cards arrive in priority order; persist it so a reopen keeps the order
        entry["order"] = card.get("priority", idx)
        # keep order/dismissed even on an otherwise-empty card
        answers[card.get("id", "")] = entry
    result = {"round": round_payload.get("round", 1), "answers": answers}
    if round_payload.get("agentActions"):
        result["agentActions"] = round_payload["agentActions"]
    return result


def render_html(plan: dict, saved: dict | None, out_path: Path) -> None:
    """Render the deck template with the plan data and any saved answers.

    :param plan: The parsed plan.json object.
    :param saved: Previously autosaved answers to preload, or ``None``.
    :param out_path: Where to write the self-contained HTML file.
    :raises FileNotFoundError: if the deck template is missing.
    """
    if not TEMPLATE.exists():
        raise FileNotFoundError(f"deck template not found: {TEMPLATE}")
    html = TEMPLATE.read_text(encoding="utf-8")

    def inline_json(obj) -> str:
        # Plan content (e.g. hi-fi HTML mocks) can contain </script>, <!--,
        # --> and <script>, all of which can break out of the surrounding
        # script element's parse states. Escape the dangerous openers with a
        # backslash — JS string literals drop unknown backslash escapes, so
        # the decoded values are unchanged.
        blob = json.dumps(obj, ensure_ascii=False)
        return re.sub(r"(?i)<(/|!--|script)", r"<\\\1", blob)

    # anchored substitution: ONLY the script assignments, never prose that
    # happens to mention a placeholder (that bug ate a plan once)
    anchors = {
        "let PLAN = {{PLAN_JSON}};": f"let PLAN = {inline_json(plan)};",
        "const SAVED = {{SAVED_ANSWERS}};": f"const SAVED = {inline_json(saved)};",
    }
    for needle, repl in anchors.items():
        if html.count(needle) != 1:
            raise ValueError(f"template anchor missing or ambiguous: {needle!r}")
        html = html.replace(needle, repl, 1)
    out_path.write_text(html, encoding="utf-8")


def free_port(host: str) -> int:
    """Pick an OS-assigned free TCP port on the given interface.

    :param host: Interface address to bind (e.g. ``127.0.0.1`` or ``0.0.0.0``).
    :returns: A port number currently free on that interface.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def lan_ip() -> str | None:
    """Best-effort detection of this machine's LAN IP, for phone-friendly URLs.

    :returns: The outbound-interface IPv4 address, or ``None`` if undetectable.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("8.8.8.8", 80))  # no packets sent; just picks a route
            return s.getsockname()[0]
        except OSError as exc:
            log.warning("could not detect LAN IP: %s", exc)
            return None


def questions_path_for(plan_path: Path) -> Path:
    """Locate the live question inbox that sits next to the plan file.

    Named after the plan file (``<stem>.questions.json``) so plans sharing a
    directory don't share an inbox.

    :param plan_path: Resolved path to ``plan.json``.
    :returns: Path to the sibling ``<stem>.questions.json``.
    """
    return plan_path.parent / f"{plan_path.stem}.questions.json"


def append_question(path: Path, question: dict) -> None:
    """Append a pending question to the inbox file (read-modify-write).

    :param path: The ``questions.json`` path.
    :param question: ``{id, cardId, text, ts}`` to append with ``status:"pending"``.
    :raises OSError: if the write fails.
    """
    items = []
    if path.exists():
        try:
            items = json.loads(path.read_text(encoding="utf-8")) or []
        except (ValueError, OSError):
            items = []
    question = {**question, "status": "pending"}
    items.append(question)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".questions-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False)
        os.replace(tmp_name, path)
    except OSError:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def build_handler(html_path: Path, plan_path: Path, answers_path: Path,
                  questions_path: Path, result_box: dict, done: threading.Event,
                  sse_clients: list, clients_lock: threading.Lock):
    """Create a request handler: serves the page, autosave/submit/ask sinks, and an SSE stream.

    :param html_path: The rendered deck HTML to serve at ``/``.
    :param plan_path: The live ``plan.json`` (re-read and pushed over SSE on change).
    :param answers_path: Where ``POST /save`` autosaves the in-progress answers.
    :param questions_path: Where ``POST /ask`` appends a live question.
    :param result_box: Mutable dict the handler writes the submitted round into.
    :param done: Event set once a round is received, to release the main wait.
    :param sse_clients: Shared list of open SSE ``wfile`` streams to push to.
    :param clients_lock: Guards mutation of ``sse_clients``.
    :returns: A ``BaseHTTPRequestHandler`` subclass.
    """

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:  # silence default stderr spam
            pass

        def _read_json(self) -> dict | None:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                return json.loads(raw.decode("utf-8"))
            except (ValueError, UnicodeDecodeError) as exc:
                log.error("could not parse request body: %s", exc)
                return None

        def _respond_json(self, code: int, body: bytes = b'{"ok":true}') -> None:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            if self.path in ("/", "/index.html"):
                body = html_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path == "/plan":
                # Plain one-shot read of the current plan. This is the polling
                # fallback for environments where SSE doesn't survive the network
                # path — notably Cloudflare quick-tunnels, which buffer
                # text/event-stream so the live push never arrives. A one-shot
                # GET is forwarded by every proxy, so the deck polls this and
                # reconciles on a `rev` bump when SSE goes silent.
                try:
                    body = plan_path.read_bytes()
                except OSError:
                    self.send_response(503)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-cache, no-store")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path == "/events":
                # SSE: hold the connection open; the plan-watcher thread pushes
                # `plan-updated` events to every registered client.
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.send_header("Access-Control-Allow-Origin", "*")
                # best-effort hint to disable proxy buffering (nginx & friends);
                # quick-tunnels may ignore it, which is why /plan polling exists.
                self.send_header("X-Accel-Buffering", "no")
                self.end_headers()
                try:  # push the current plan immediately so a fresh/reconnected client syncs
                    self.wfile.write(b": connected\n\n")
                    self.wfile.write(sse_frame("plan-updated", plan_path.read_text("utf-8")))
                    self.wfile.flush()
                except OSError:
                    return
                with clients_lock:
                    sse_clients.append(self.wfile)
                # block this worker thread until the client goes away
                try:
                    while not done.is_set():
                        time.sleep(1.0)
                except OSError:
                    pass
                finally:
                    with clients_lock:
                        if self.wfile in sse_clients:
                            sse_clients.remove(self.wfile)
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self) -> None:
            if self.path == "/save":
                data = self._read_json()
                if data is None:
                    self._respond_json(400, b'{"ok":false}')
                    return
                try:
                    save_answers_atomic(answers_path, data)
                except OSError as exc:
                    log.error("autosave failed (%s): %s", answers_path, exc)
                    self._respond_json(500, b'{"ok":false}')
                    return
                self._respond_json(200)
            elif self.path == "/ask":
                # live question — queue it for the agent loop and tell stdout
                data = self._read_json()
                if data is None or not (data.get("text") or "").strip():
                    self._respond_json(400, b'{"ok":false}')
                    return
                q = {"id": data.get("id") or "", "cardId": data.get("cardId") or "",
                     "text": data["text"].strip()}
                try:
                    append_question(questions_path, q)
                except OSError as exc:
                    log.error("could not queue question (%s): %s", questions_path, exc)
                    self._respond_json(500, b'{"ok":false}')
                    return
                # echo an immediate per-card "received — agent is on it" frame so
                # the deck never shows the misleading "no agent watching" while a
                # Monitor is about to wake the agent on the stdout line below.
                push_sse(sse_frame("ask-received",
                                   json.dumps({"cardId": q["cardId"], "id": q["id"]},
                                              ensure_ascii=False)),
                         sse_clients, clients_lock)
                # emit on stdout so a watching agent Monitor wakes immediately (push)
                print(json.dumps({"action": "ask", **q}, ensure_ascii=False), flush=True)
                self._respond_json(200)
            elif self.path == "/answer":
                # agent pushed a single-card answer — stream it to the open deck
                # over SSE without a full plan rewrite. Body: {cardId, text, id?}.
                data = self._read_json()
                if data is None or not (data.get("cardId") or "").strip() \
                        or not (data.get("text") or "").strip():
                    self._respond_json(400, b'{"ok":false}')
                    return
                ans = {"cardId": data["cardId"].strip(), "text": data["text"].strip(),
                       "id": data.get("id") or ""}
                push_sse(sse_frame("card-answer",
                                   json.dumps(ans, ensure_ascii=False)),
                         sse_clients, clients_lock)
                self._respond_json(200)
            elif self.path == "/submit":
                data = self._read_json()
                if data is None:
                    self._respond_json(400, b'{"ok":false}')
                    return
                # persist the round too (in the autosave shape the deck restores
                # from), so a crash after submit loses nothing
                try:
                    save_answers_atomic(answers_path, round_to_answers(data))
                except OSError as exc:
                    log.warning("could not persist submitted round: %s", exc)
                result_box["round"] = data
                self._respond_json(200)
                done.set()
            else:
                self.send_response(404)
                self.end_headers()

    return Handler


def push_sse(frame: bytes, sse_clients: list, clients_lock: threading.Lock) -> None:
    """Write one SSE frame to every open client, dropping any that have closed.

    :param frame: An encoded SSE frame (from :func:`sse_frame`).
    :param sse_clients: Shared list of open SSE ``wfile`` streams.
    :param clients_lock: Guards mutation of ``sse_clients``.
    """
    with clients_lock:
        dead = []
        for w in sse_clients:
            try:
                w.write(frame)
                w.flush()
            except OSError:
                dead.append(w)
        for w in dead:
            sse_clients.remove(w)


def sse_frame(event: str, data: str) -> bytes:
    """Encode a single SSE event frame (data may be multi-line JSON).

    :param event: The SSE event name (e.g. ``plan-updated``).
    :param data: The payload; newlines are split across ``data:`` lines per spec.
    :returns: The encoded frame ready to write to a stream.
    """
    lines = "".join(f"data: {ln}\n" for ln in data.split("\n"))
    return f"event: {event}\n{lines}\n".encode("utf-8")


def watch_and_push(plan_path: Path, sse_clients: list, clients_lock: threading.Lock,
                   done: threading.Event) -> None:
    """Watch the plan file and push it to all SSE clients whenever it changes.

    This is the one allowed poll: we wait on external state (the agent rewriting
    ``plan.json``) that we cannot subscribe to, on a short bounded interval. A
    heartbeat comment keeps idle connections open.

    :param plan_path: The live plan file to watch.
    :param sse_clients: Shared list of open SSE ``wfile`` streams.
    :param clients_lock: Guards ``sse_clients``.
    :param done: When set, the watcher exits.
    """
    last_mtime = -1.0
    heartbeat_at = 0
    while not done.is_set():
        try:
            mtime = plan_path.stat().st_mtime
        except FileNotFoundError:
            time.sleep(0.3)
            continue
        frame = None
        if mtime != last_mtime:
            last_mtime = mtime
            try:
                frame = sse_frame("plan-updated", plan_path.read_text("utf-8"))
            except OSError:
                frame = None
        heartbeat_at += 1
        if frame is None and heartbeat_at >= 60:  # ~every 18s
            frame = b": heartbeat\n\n"
            heartbeat_at = 0
        if frame is not None:
            push_sse(frame, sse_clients, clients_lock)
        time.sleep(0.3)


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve an interactive plan deck.")
    parser.add_argument("--plan", required=True, help="Path to plan.json")
    parser.add_argument("--timeout", type=int, default=1800,
                        help="Max seconds to wait for the user to submit (default 1800)")
    parser.add_argument("--no-open", action="store_true",
                        help="Do not auto-open the browser (print the URL instead)")
    parser.add_argument("--host", default="127.0.0.1",
                        help="Interface to bind (default 127.0.0.1; use 0.0.0.0 to "
                             "open the deck from a phone on the same network)")
    parser.add_argument("--port", type=int, default=0,
                        help="Port to bind (default 0 = pick a random free port). "
                             "Pin a fixed port so a tunnel URL survives deck restarts.")
    parser.add_argument("--live", action="store_true",
                        help="Live mode: keep serving and stream plan.json changes to "
                             "the open deck over SSE, printing each /ask question to "
                             "stdout as it arrives (instead of exiting on first submit).")
    args = parser.parse_args()

    plan_path = Path(args.plan).expanduser().resolve()
    if not plan_path.exists():
        log.error("plan file not found: %s", plan_path)
        return 2
    try:
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
    except ValueError as exc:
        log.error("plan.json is not valid JSON: %s", exc)
        return 2

    answers_path = answers_path_for(plan_path)
    saved = load_saved_answers(answers_path)
    if saved is not None:
        log.info("restoring autosaved answers from %s", answers_path)

    port = args.port if args.port else free_port(args.host)
    tmp = Path(tempfile.mkdtemp(prefix="plan-html-"))
    html_path = tmp / "deck.html"
    try:
        render_html(plan, saved, html_path)
    except FileNotFoundError as exc:
        log.error("%s", exc)
        return 2

    questions_path = questions_path_for(plan_path)
    result_box: dict = {}
    done = threading.Event()
    sse_clients: list = []
    clients_lock = threading.Lock()
    handler = build_handler(html_path, plan_path, answers_path, questions_path,
                            result_box, done, sse_clients, clients_lock)
    server = ThreadingHTTPServer((args.host, port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    if args.live:
        watcher = threading.Thread(
            target=watch_and_push,
            args=(plan_path, sse_clients, clients_lock, done), daemon=True)
        watcher.start()

    url = f"http://127.0.0.1:{port}/"
    mode = "LIVE — questions answered in place" if args.live else f"round {plan.get('round', 1)}"
    log.info("serving plan deck (%s) at %s", mode, url)
    if args.host != "127.0.0.1":
        phone_ip = lan_ip()
        if phone_ip:
            log.info("on your phone (same network): http://%s:%d/", phone_ip, port)
    log.info("waiting up to %ds (answers autosave as you go)…", args.timeout)
    if args.no_open:
        log.info("open this URL to review: %s", url)
    else:
        try:
            webbrowser.open(url)
        except Exception as exc:  # noqa: BLE001 — any backend failure → fall back to URL
            log.warning("could not auto-open browser (%s); open manually: %s", exc, url)

    # Distinguish a real idle-timeout from an external signal (SIGTERM/SIGINT,
    # e.g. the parent restarting the deck). Both make done.wait() return without
    # a round, but they mean different things — and reporting "timed out after
    # Ns" for a signal that arrived in seconds is misleading.
    interrupted = threading.Event()

    def _on_signal(signum, _frame):
        interrupted.set()
        done.set()

    for _sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(_sig, _on_signal)
        except (ValueError, OSError):
            pass  # not on the main thread / unsupported — skip

    got_it = done.wait(timeout=args.timeout)

    # graceful shutdown + cleanup of the temp HTML we created
    done.set()  # release SSE worker loops + the watcher
    server.shutdown()
    try:
        html_path.unlink(missing_ok=True)
        tmp.rmdir()
    except OSError as exc:
        log.warning("temp cleanup left files behind in %s: %s", tmp, exc)

    if not got_it:
        partial = load_saved_answers(answers_path)
        if interrupted.is_set():
            log.info("interrupted — shutting down; autosaved answers preserved in %s",
                     answers_path)
            print(json.dumps({"action": "interrupted", "saved": partial},
                             ensure_ascii=False))
        else:
            log.error("timed out after %ds — autosaved answers are preserved in %s",
                      args.timeout, answers_path)
            print(json.dumps({"action": "timeout", "timedOut": True, "saved": partial},
                             ensure_ascii=False))
        return 1

    log.info("received the user's round — handing back to the agent")
    print(json.dumps(result_box["round"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
