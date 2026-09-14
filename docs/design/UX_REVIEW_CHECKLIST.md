# UX / UI Release Checklist

## Product

- [ ] Primary user and task are explicit.
- [ ] One dominant object/hierarchy is obvious.
- [ ] No unapproved controls or routes were added.
- [ ] Copy is human and domain-appropriate.

## Visual system

- [ ] Tokens drive colors, spacing, type, radius, and elevation.
- [ ] No AI-slop blacklist violations.
- [ ] Clickable/passive/selected/disabled states are distinct.
- [ ] Numbers and technical text use appropriate numeric/mono treatment.
- [ ] Icons share a coherent language.

## Responsive

- [ ] All required viewports checked.
- [ ] No page-level horizontal overflow.
- [ ] No primary horizontal table scroll.
- [ ] Mobile/tablet recompose rather than squeeze.
- [ ] Maps/graphs/editors retain useful dimensions.
- [ ] 200% zoom and 400% reflow usable.

## Accessibility

- [ ] Keyboard flow complete.
- [ ] Focus visible and restored correctly.
- [ ] Names, roles, values, and selected states exposed.
- [ ] Contrast passes.
- [ ] Touch targets pass.
- [ ] Reduced motion supported.
- [ ] No hover-only critical information.

## State and truth

- [ ] Loading/error/empty/filtered-empty/partial/stale/unavailable handled.
- [ ] Missing is not zero.
- [ ] Fixture data excluded from production.
- [ ] Forecast/model/observation/authority distinctions preserved.
- [ ] External source failures remain visible and honest.

## Verification

- [ ] Runtime screenshots captured.
- [ ] Reference overlay/diff generated where applicable.
- [ ] Geometry/style reports generated where applicable.
- [ ] Console and network inspected.
- [ ] Functional tests pass.
- [ ] No dead controls or accidental generated files.
- [ ] Completion report names every failed or unrun gate.
