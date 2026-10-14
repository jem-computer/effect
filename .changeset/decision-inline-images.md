---
"effect": patch
"@effect/ai-typesafe": patch
---

Add `Decision.image` for images inside instructions and criteria, such as example pictures for classification labels. An inline image is JSON, so `Decision.Description` is unchanged. Models created with `supportsInlineImages: true` receive inline images in place; other image-capable models receive them after the call's images, each replaced by a `[image N]` reference; models without image support reject them. `TypeSafeDecisionModel` sends inline images in place as assets.
