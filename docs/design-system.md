# Simfiment design system

Simfiment uses a standard Material 3 interaction model with a restrained Netstamp-inspired art direction: neutral black and white surfaces, orange only as a signal, subtle technical grids, and semantic green/red reserved for income and expense.

## Foundations

- Semantic color roles and light/dark values live in `web/src/styles/tokens.css`. Components must consume roles such as `--md-sys-color-surface-container` rather than fixed colors.
- Shape follows Material 3: full pills for buttons and segmented controls, 16 px cards, and 28 px dialogs and bottom sheets.
- Layout breakpoints are compact below 600 px, medium from 600 px, and expanded from 1200 px. Compact uses bottom navigation, medium uses a rail, and expanded uses a navigation drawer.
- Material Symbols are local SVG assets from `@material-symbols/svg-400`; the icon wrapper renders them as current-color masks, so no font or CDN request is required.

## Components

Shared controls live in `web/src/components/ui`. Use `Button`, `IconButton`, `TextField`, `NumericField`, `SelectField`, `SegmentedControl`, `ChoiceChipGroup`, `SwitchField`, `CheckboxField`, `Disclosure`, `AdaptiveModal`, `ActionMenu`, `Card`, and `Chip` before adding feature-specific controls.

`AdaptiveModal` becomes a dialog at medium and expanded widths and a swipeable bottom drawer at compact widths. Keep native date and datetime inputs inside `TextField`; their platform pickers are more usable than a custom calendar for this application.

## Accessibility

- Every icon-only action needs an accessible label.
- Do not encode income, expense, warning, or selection by color alone; pair color with text, sign, shape, or state.
- Preserve 44 px compact touch targets, visible focus rings, reduced-motion behavior, 320 px width support, and 200% text zoom.
- Use Base UI state attributes and semantic roles instead of manually reproducing keyboard or focus behavior.

## Feature styling

Feature layout belongs in `web/src/styles/ui.module.css`; reusable interaction states belong with the primitives in `web/src/components/ui/primitives.module.css`. Avoid inline layout styles and avoid reintroducing legacy feature buttons or native selects.
