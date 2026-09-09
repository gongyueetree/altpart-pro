# PartBridge 元件通 · v7.1.0 bilingual release

This release broadens the product identity to component lookup, design-resource downloads and alternative recommendations. It does not claim completion of the earlier v7.1 Candidate Repository / database roadmap.

## Language and display

The header provides 中文 / English controls. Selection is stored as `partbridge.language`; Chinese is the initial default. Switching updates the page title and HTML language without remounting the workbench. Original API objects, component IDs, constraint values, procurement controls, pin selection, viewport state and downloaded CAD data are not localized.

`public/i18n/en.js` contains the reviewed UI glossary (450+ entries), including warnings, supplier tabs, parameter names, procurement options and 3D messages. A project-scoped JSX factory wraps display strings and display-only attributes in reactive translation components. It does not modify React, mutate the DOM outside React or recursively translate the data model. Input values, option values, URLs, element IDs, refs and events are preserved. Chinese and English parameter names may both appear in source data; both are displayed in English in English mode.

English mode batches unknown Chinese descriptions, parameter labels, categorical values and dynamic explanations through `POST /api/v2/translate`. Requests are deduplicated, serialized and cached in browser memory. Static glossary strings need no model call. CSV/Markdown report text also uses this presentation service. KiCad symbols, footprints and STEP source files remain technical source artifacts, not translated documents.

## Configuration and failure behavior

Uses the existing `GEMINI_API_KEY` and `GEMINI_MODEL`; no extra translation-provider credentials are needed. The same API authentication and instance rate-limit policy applies. Authentication deployments must provide their normal authenticated access path; no browser secret is added. New text may incur Gemini usage; repeats use bounded memory caches. These are per-instance caches, not Redis or persistent tenant quotas.

No automatic translation is called in Chinese mode. In English mode, pending text displays “Translating…”. Missing credentials, timeout, malformed output or validation failure produce an English notice and show the source text with an explicit retry action. There is no false English substitute and no endless automatic retry. Report export fails visibly instead of silently producing a mixed-language report.

## Technical-data protection

The model receives text as data, not instructions. ASCII spans (part numbers, numeric values, units, URLs and report delimiters) are replaced by immutable request-specific tokens. The service rejects missing, duplicated or reordered tokens, newly introduced numbers and untranslated Chinese. Accepted output is presentation-only and is not technical evidence. Translations never change analysis signatures, scoring inputs or original database records.

Requests allow at most 32 strings, 2048 characters per string and 12000 characters total. The service permits two concurrent model batches per instance. Its bounded cache contains at most 2000 entries, with a 24-hour TTL. Provider errors and credentials are never returned to clients. Authentication and request-size tests cover the new route.

## Validation

- Existing pin interaction / 3D CSP / scoring / procurement regression tests remain enabled.
- Translation behavior tests cover token integrity, caching, malformed model responses, bounded batching, failures, retries, locale changes during requests and authentication.
- DOM integration tests run the actual production bundle with React 18.2.0 in jsdom: homepage labels need no model call; language switches preserve part input, procurement controls and original values.
- Local CI commands: `npm run check`, `npm run build`, `npm test`.
- Model responses in automated tests are controlled fixtures. Deployment validation must distinguish actual Gemini translation from fixture and glossary translation.
