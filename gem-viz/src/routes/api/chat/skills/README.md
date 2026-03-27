# Gembot Skills

These YAML files are injected into Gembot's system prompt at runtime.

Edit them when you want to teach Gembot:
- when to use a backend route
- what query shape works
- what caveats to remember
- which curl examples are good defaults

Suggested shape:

```yaml
id: short-id
name: Human Name
purpose: One-line purpose
use_when:
  - Situation one
tool_preference:
  - Preferred tool or order
notes:
  - Caveat or backend quirk
curl_examples:
  - title: Example title
    command: curl -sS 'https://gem-api.thirdbear.net/...'
response_habits:
  - How Gembot should summarize results
```

Guidelines:
- Keep each file focused on one query family.
- Prefer real working curl examples.
- Note backend quirks explicitly.
- Keep examples GET-only unless the backend requires something else.
