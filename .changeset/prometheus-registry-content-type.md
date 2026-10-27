---
'@hono/prometheus': patch
---

fix(prometheus): send the registry's content type from `printMetrics`

`printMetrics` now responds with `registry.contentType` as its `Content-Type` header instead of the generic `text/plain;charset=UTF-8`, so registries created with `Registry.OPENMETRICS_CONTENT_TYPE` are served as OpenMetrics.
