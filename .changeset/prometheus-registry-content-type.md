---
'@hono/prometheus': patch
---

Send the registry's content type from `printMetrics`, so a registry created with `Registry.OPENMETRICS_CONTENT_TYPE` is served as `application/openmetrics-text` and the default registry as `text/plain; version=0.0.4; charset=utf-8` instead of a generic `text/plain;charset=UTF-8`.
