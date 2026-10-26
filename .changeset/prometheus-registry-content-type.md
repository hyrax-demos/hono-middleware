---
'@hono/prometheus': patch
---

Send the registry's content type from `printMetrics`, so a registry set to `Registry.OPENMETRICS_CONTENT_TYPE` is served as OpenMetrics and the default registry is served as `text/plain; version=0.0.4; charset=utf-8` instead of plain `text/plain`. The `registry` option now also accepts a `Registry<OpenMetricsContentType>`.
