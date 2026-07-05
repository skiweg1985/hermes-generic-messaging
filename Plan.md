# Universal Hermes Platform Adapter (v2.1) – Cursor-Ready Execution Plan

> **Status:** historical execution plan. The adapter and web app are implemented in
> this repository; use `README.md`, `docs/custom_chat.md`, `docs/web-app.md`, and
> `docs/interface_contract.md` as the current documentation.

> **For Cursor:** Implement strictly PR-by-PR in this order. Do not skip tests. Do not combine PR scopes.

**Goal:** Einen universellen Hermes-Messaging-Adapter im Repo `skiweg1985/hermes-generic-messaging` implementieren, mit Streaming, Slash-Commands und Audio (STT/TTS).

**Primary repo (code versioning):** `https://github.com/skiweg1985/hermes-generic-messaging`  
**Reference repo/patterns:** `https://github.com/NousResearch/hermes-agent`  
**Docs reference:** `https://hermes-agent.nousresearch.com/docs/developer-guide/adding-platform-adapters`

---

## Working rules for Cursor

1. Implement exactly one PR scope at a time.
2. If a file/path does not exist, discover equivalent path first and continue.
3. Keep adapter logic transport-focused; do not duplicate Hermes core logic.
4. Keep commits small and reviewable.
5. Every PR must include tests + docs updates for its scope.

---

## Preflight (once)

### Objective
Repo readiness + exact path discovery so later steps are deterministic.

### Steps
1. Clone/open repo:
   - `gh repo clone skiweg1985/hermes-generic-messaging` (if missing)
2. Create branch for PR1:
   - `git checkout -b feat/adapter-contract-v1`
3. Discover and record exact equivalents for:
   - gateway/platform adapter directory
   - adapter registry/loader file
   - config defaults/schema file
   - tests directory for gateway adapters
   - docs path for architecture/usage docs
4. Add a small planning note file in-repo documenting discovered exact paths.

### Deliverable
- `docs/plans/path-discovery.md` with exact concrete paths used by following PRs.

### Verification
- `git status` clean except new doc file.

---

## PR1 — Contract + Config Skeleton

### Objective
Define protocol and config contract before code behavior.

### Scope
- Add normative Event Schema v1 doc.
- Add adapter config keys/defaults (disabled by default).
- No runtime adapter behavior yet.

### Files (target classes; map to discovered paths)
- Create: `docs/plans/universal-platform-adapter-v1.md`
- Modify: config defaults/schema file
- Modify: env/config reference docs

### Required content
- Envelope fields: `schema_version`, `event_id`, `timestamp`, `platform`, `chat_id`, `user_id`, optional `thread_id`, `session_id`, `type`, `payload`
- Inbound event types: `message.create`, `command.create`, `audio.uploaded`, `message.cancel`
- Outbound event types: `assistant_start`, `assistant_delta`, `assistant_done`, `assistant_audio`, `assistant_error`
- Error codes minimum set
- Idempotency + sequencing rules

### Tests
- Config validation test (new keys accepted, defaults applied)

### DoD
- Contract doc merged in repo
- Config keys are loadable without runtime errors
- No behavior changes in existing adapters

---

## PR2 — Adapter Scaffold + Text Roundtrip (non-streaming fallback)

### Objective
Create adapter skeleton and make plain text request/response work.

### Scope
- New adapter class/module
- Registry/loader hookup
- Inbound `message.create` parsing + validation
- Outbound single final response event (`assistant_done`) as fallback

### Files
- Create: adapter module (e.g. `.../platforms/custom_chat.py`)
- Modify: adapter registry/loader
- Create/Modify: basic adapter tests

### Tests
1. Adapter boot test (enabled config starts cleanly)
2. Inbound text event mapped to Hermes input
3. Outbound final response event emitted

### DoD
- End-to-end text works in local test harness
- Existing platforms unaffected

---

## PR3 — Streaming Pipeline

### Objective
Enable token/chunk streaming semantics.

### Scope
- Emit `assistant_start`
- Emit ordered `assistant_delta` with `sequence`
- Emit `assistant_done`
- Emit `assistant_error` on failure

### Files
- Modify: adapter module
- Modify/Create: streaming helper/util
- Modify: streaming-focused tests

### Tests
1. Sequence monotonicity test
2. Start/delta/done lifecycle test
3. Failure path emits `assistant_error`

### DoD
- Streaming output stable and ordered
- Frontend consumer can render progressively

---

## PR4 — Slash Commands Parity

### Objective
Support Telegram-like slash commands.

### Scope
- Messages beginning with `/` treated as commands
- Pass-through to Hermes command layer
- Optional local command bypass hook (off by default)

### Files
- Modify: adapter module
- Modify/Create: command routing tests
- Docs: command behavior notes

### Tests
- `/model` route test
- `/reset` route test
- Unknown command behavior test

### DoD
- Command UX parity with expected Hermes behavior

---

## PR5 — Audio Inbound (STT) + Outbound (TTS)

### Objective
Voice support in same conversation/session.

### Scope
- Inbound `audio.uploaded` handling
- STT integration path to user text
- TTS response surfaced as `assistant_audio`
- MIME/type/size validation

### Files
- Modify: adapter module
- Create/Modify: media helper module
- Create/Modify: audio tests

### Tests
1. Valid audio event accepted and transcribed path invoked
2. Unsupported MIME rejected with correct error
3. TTS output converted to `assistant_audio` event

### DoD
- Voice input/output works in integration test harness

---

## PR6 — Reliability + Security Hardening

### Objective
Production-safe behavior under retries/reconnect/abuse.

### Scope
- Inbound dedupe (`event_id` + TTL)
- Cancel handling (`message.cancel`)
- Optional replay window for missed deltas
- Auth validation (Bearer/mTLS/signature as chosen)
- Rate limiting
- Structured correlation logging

### Files
- Modify: adapter module
- Modify/Create: state store helper (in-memory/redis abstraction)
- Modify: config/docs
- Modify/Create: hardening tests

### Tests
1. Duplicate inbound event only processed once
2. Cancel stops active stream
3. Unauthorized request rejected
4. Rate limit exceeded returns proper error

### DoD
- Deterministic behavior under reconnect/duplicate scenarios
- Security gates enforced

---

## PR7 — Final E2E + Docs + Example Client Contract

### Objective
Ship with complete verification and handover docs.

### Scope
- E2E scenario tests across text/stream/command/audio
- Operator docs (config, env vars, troubleshooting)
- Example FastAPI/WebSocket event contract snippets

### Files
- Create/Modify: `tests/.../test_custom_chat_e2e.py`
- Modify: docs pages
- Create: `docs/examples/custom-chat-events-v1.json` (or equivalent)

### Tests
- Full suite for adapter area
- Optional full project suite

### DoD
- New contributor can run and integrate adapter from docs alone

---

## Exact Event Schema v1 (for implementation)

### Envelope
```json
{
  "schema_version": "v1",
  "event_id": "uuid",
  "timestamp": "2026-05-23T10:49:09Z",
  "platform": "custom_chat",
  "chat_id": "workspace:conversation",
  "thread_id": "optional",
  "user_id": "user-id",
  "session_id": "optional",
  "type": "message.create",
  "payload": {}
}
```

### Inbound types
- `message.create` `{ message_id, text, idempotency_key? }`
- `command.create` `{ message_id, command }`
- `audio.uploaded` `{ message_id, mime_type, size_bytes, url|file_ref }`
- `message.cancel` `{ target_message_id }`

### Outbound types
- `assistant_start` `{ message_id }`
- `assistant_delta` `{ message_id, sequence, delta }`
- `assistant_done` `{ message_id, final_text? }`
- `assistant_audio` `{ message_id, mime_type, url|file_ref }`
- `assistant_error` `{ message_id, code, message }`

### Error codes
- `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`, `STREAM_TIMEOUT`, `INTERNAL_ERROR`

---

## Validation commands (adapt to repo tooling)

- Adapter tests only:
  - `python -m pytest tests/gateway -q`
- Full suite:
  - `python -m pytest tests/ -o 'addopts=' -q`

If repo uses `uv`/`poetry`, replace accordingly and document in `docs/plans/path-discovery.md`.

---

## Risks / trade-offs

- Replay + streaming + cancel increase state complexity.
- Audio codec normalization may require transcode step.
- Universal schema reduces future cost but increases initial design strictness.

---

## Handoff prompt for Cursor (copy/paste)

```text
Implement PR1 only from `.hermes/plans/2026-05-23_104909-universal-hermes-platform-adapter-v2.1-cursor-ready.md`.

Rules:
1) First create/update `docs/plans/path-discovery.md` with exact repo paths that match the plan’s target classes.
2) Then execute only PR1 scope (Contract + Config Skeleton).
3) Add tests for config-key/default validation.
4) Do not implement runtime adapter behavior yet.
5) Return: changed files list, test commands run, and test results.
```

---

## Next action after PR1 merge

Proceed with PR2 using same plan and strict scope gating.
