---
'@hono/prometheus': patch
---

Send the registry's content type from `printMetrics`, so OpenMetrics registries are served as `application/openmetrics-text; version=1.0.0; charset=utf-8` and the default registry as `text/plain; version=0.0.4; charset=utf-8` instead of `text/plain;charset=UTF-8`.
