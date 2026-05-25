# Universal Platform Adapter — Event Schema v1

Normative contract for the `custom_chat` Hermes platform adapter.

## Envelope

Every event is a JSON object with these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `schema_version` | yes | Must be `"v1"` |
| `event_id` | yes | UUID; used for idempotency |
| `timestamp` | yes | ISO-8601 UTC |
| `platform` | yes | Must be `"custom_chat"` |
| `chat_id` | yes | Conversation identifier |
| `user_id` | yes | Sender identifier |
| `thread_id` | no | Thread within chat |
| `session_id` | no | Client session |
| `type` | yes | Event type (see below) |
| `payload` | yes | Type-specific body |

## Inbound types

### `message.create`

```json
{
  "message_id": "msg-uuid",
  "text": "Hello",
  "attachments": [
    {
      "attachment_id": "att-uuid",
      "mime_type": "image/png",
      "size_bytes": 12345,
      "url": "https://example.local/image.png",
      "filename": "image.png"
    }
  ],
  "idempotency_key": "optional-client-key"
}
```

`text` may be empty when `attachments` is non-empty. Each attachment requires `url` or `file_ref`.

### `command.create`

```json
{
  "message_id": "msg-uuid",
  "command": "/model gpt-4"
}
```

### `audio.uploaded`

```json
{
  "message_id": "msg-uuid",
  "mime_type": "audio/ogg",
  "size_bytes": 12345,
  "url": "https://example.local/audio.ogg"
}
```

Either `url` or `file_ref` is required.

### `message.cancel`

```json
{
  "target_message_id": "msg-uuid-being-cancelled"
}
```

## Outbound types

### `assistant_start`

```json
{ "message_id": "reply-msg-uuid" }
```

### `assistant_delta`

```json
{
  "message_id": "reply-msg-uuid",
  "sequence": 1,
  "delta": "partial text"
}
```

`delta` is an **incremental** text chunk (not cumulative). Clients append each delta to the current assistant line.

### `assistant_segment`

Boundary within a single assistant turn (for example after a tool call):

```json
{
  "message_id": "turn-msg-uuid",
  "segment_message_id": "turn-msg-uuid-s1",
  "label": "🔧 read_file"
}
```

Clients finalize the current streaming line and continue in a new assistant line identified by `segment_message_id`.

### `assistant_done`

```json
{
  "message_id": "reply-msg-uuid",
  "final_text": "complete answer",
  "turn_message_id": "turn-msg-uuid",
  "segments": 2
}
```

`segments` is optional telemetry for multi-segment turns.

### `assistant_notice`

```json
{
  "message_id": "notice-msg-uuid",
  "kind": "info",
  "text": "Provider switched to gpt-5"
}
```

`kind` may be `info`, `tool`, `reasoning`, `warning`, or `error`.

### `assistant_audio`

```json
{
  "message_id": "reply-msg-uuid",
  "mime_type": "audio/mpeg",
  "url": "https://example.local/reply.mp3"
}
```

### `assistant_error`

```json
{
  "message_id": "reply-msg-uuid",
  "code": "BAD_REQUEST",
  "message": "Human-readable detail"
}
```

## Error codes

| Code | HTTP analogue |
|------|----------------|
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `RATE_LIMITED` | 429 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `STREAM_TIMEOUT` | 504 |
| `INTERNAL_ERROR` | 500 |

## Idempotency

- Inbound events with the same `event_id` within the dedupe TTL are processed at most once.
- Optional `payload.idempotency_key` is logged for client correlation but does not replace `event_id`.

## Sequencing

- `assistant_delta.sequence` is a strictly increasing integer per `message_id`, starting at `1`.
- Clients must ignore deltas with `sequence` less than or equal to the highest seen for that `message_id`.
- `assistant_start` is emitted before the first `assistant_delta`.
- `assistant_done` or `assistant_error` terminates the stream for that `message_id`.

## Authentication

WebSocket clients send `Authorization: Bearer <token>` on the HTTP upgrade request. Missing or invalid tokens receive `assistant_error` with code `UNAUTHORIZED` and the connection is closed.
