---
'@hono/prometheus': patch
---

Send the registry's content type as the `Content-Type` of the `printMetrics` response, so OpenMetrics registries are labelled `application/openmetrics-text` and the default registry is labelled with the Prometheus text format version instead of plain `text/plain`. The `registry` option's type now accepts a registry typed for OpenMetrics as well as one typed for the Prometheus text format.
