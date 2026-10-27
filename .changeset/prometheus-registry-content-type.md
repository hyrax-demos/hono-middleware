---
'@hono/prometheus': patch
---

Send the registry's content type as the `Content-Type` of the `printMetrics` response instead of `text/plain;charset=UTF-8`, so an OpenMetrics registry is served as `application/openmetrics-text`. The `registry` option now also accepts a `Registry<OpenMetricsContentType>`.
