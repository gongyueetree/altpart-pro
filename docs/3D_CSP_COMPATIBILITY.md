# STEP 3D preview and Content Security Policy

## v7.0.1 regression fix

The v7.0.0 security header blocked the existing STEP viewer before it could
render a model. The first error came from the application's `new Function`
wrapper around dynamic imports. The production Babel build only uses the React
preset, so the viewer now uses native `import()` directly.

There is a second independent requirement: the pinned `occt-import-js@0.0.23`
distribution uses Emscripten/Embind dynamic JavaScript invokers. Both
`craftInvokerFunction` and `__emval_get_method_caller` construct functions via
`newFunc(Function, ...)`. Its WebAssembly module also needs CSP permission to
compile. Allowing only `'wasm-unsafe-eval'` would still block those JS invokers.

The compatibility fix adds `'unsafe-eval'` to `script-src`. This allows both
Embind's function construction and WebAssembly compilation. This exception is
page-wide: CSP cannot grant eval to only one script URL. The application still
restricts script origins, disallows inline scripts, and retains its other CSP
directives and security headers. This tradeoff restores the existing upstream
kernel without changing its generated runtime or the STEP geometry.

Remove the exception only after using a kernel compiled with
`-sDYNAMIC_EXECUTION=0` (and, where supported, `-sEMBIND_AOT=1`) and verifying
initialization and real STEP parsing. That build will still need
`'wasm-unsafe-eval'`. Another possible future change is to isolate the parser
in a worker with its own policy; that is outside this compatibility hotfix.

References:

- [Pinned OCCT distribution](https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js)
- [Emscripten compiler settings](https://emscripten.org/docs/tools_reference/settings_reference.html#dynamic-execution)
- [MDN script-src: eval and WebAssembly](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)

## Verification

- Regression tests execute the production viewer's actual loader expression
  with string-based code generation disabled, before and after JSX compilation.
- CSP tests check compatibility with the current Embind/WASM kernel while
  keeping inline JavaScript and arbitrary script origins blocked.
- After deployment, load STM32F103C8T6 → eCAD → Load 3D model. Confirm a visible
  TQFP-48 model, nonzero mesh/triangle counts, rotation, and no CSP failure.
