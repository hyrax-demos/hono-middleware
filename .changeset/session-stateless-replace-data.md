---
'@hono/session': patch
---

Without session storage, `session.update(data)`, `session.update(fn)` and a refreshed session now replace the data in the session cookie instead of merging it with the old cookie data, so a key left out of the new data is gone on the next request, as it is with `useSessionStorage()`.
