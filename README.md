# Hermes Generic Messaging

Universal Hermes platform adapter (`custom_chat`) that speaks **Event Schema v1** over WebSocket.

## Install

```bash
pip install -e ".[dev]"
```

Copy or symlink this repo into the Hermes plugins directory:

```bash
ln -s "$(pwd)/plugins/platforms/custom_chat" ~/.hermes/plugins/custom_chat
```

Enable in `config.yaml`:

```yaml
gateway:
  platforms:
    custom_chat:
      enabled: true
      extra:
        ws_host: "127.0.0.1"
        ws_port: 8765
```

## Environment

| Variable | Description |
|----------|-------------|
| `CUSTOM_CHAT_BEARER_TOKEN` | Bearer token for WebSocket clients |
| `CUSTOM_CHAT_WS_HOST` | Bind host (default `127.0.0.1`) |
| `CUSTOM_CHAT_WS_PORT` | Bind port (default `8765`) |

See [docs/custom_chat.md](docs/custom_chat.md) and [docs/plans/universal-platform-adapter-v1.md](docs/plans/universal-platform-adapter-v1.md).

## Tests

```bash
python -m pytest tests/plugins/custom_chat -q
```
