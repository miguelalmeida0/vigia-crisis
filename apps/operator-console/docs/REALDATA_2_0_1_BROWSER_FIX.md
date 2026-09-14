# VIGIA Mission Dark Real Data 2.0.1 — Browser Harness Fix

## Fixed failure

Real Data 2.0 passed syntax, route smoke, interaction, persistence, canonical real-data, and backend proxy contracts on the target Mac, then the browser contract aborted before application assertions with:

`SyntaxError: Invalid regular expression flags`

The defect was in `tests/browser.mjs`, not in the VIGIA application. A regular-expression literal was embedded inside a JavaScript template string sent through CDP `Runtime.evaluate`. The outer JavaScript parser consumed the escaped slashes before Chrome evaluated the expression, turning the intended pattern into an invalid regex.

## Correction

The mock-image assertion now uses plain string membership checks rather than a nested regex literal:

```js
const mockImages = await c.eval(`
  [...document.images]
    .filter(i => {
      const src = i.getAttribute('src') || '';
      return src.includes('assets/maps') || src.includes('assets/fleet');
    })
    .map(i => i.getAttribute('src'))
`);
```

This removes the double-parser escaping hazard entirely.

## Verification

The rebuilt package passes locally in the packaging environment:

- syntax: PASS — 31 JavaScript modules
- route smoke: PASS — 14 routes
- interaction contract: PASS — 82 buttons, 0 dead controls
- persistence serialization: PASS
- real-data contract: PASS
- proxy JSON/binary contract: PASS
- browser harness syntax: PASS

The packaging environment has a managed Chromium URL block policy, so the browser test correctly skips there. On the target Mac, run `npm run test:browser` or `npm run verify`; the malformed-regex blocker is removed and Chrome can proceed to the actual VIGIA browser assertions.
