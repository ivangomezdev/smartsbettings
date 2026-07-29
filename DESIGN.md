# Engineering & Code Standards

## Tech Stack

- Use Next.js (App Router).
- Use JavaScript (ES2023).
- Never generate TypeScript.
- Never use interfaces or types.
- Use vanilla CSS only.
- Do NOT use Tailwind CSS.
- Do NOT use CSS Modules.
- Do NOT use Styled Components.
- Do NOT use Emotion.
- Do NOT use Sass or SCSS.
- Do NOT use inline styles.

---

## CSS Architecture

Use plain CSS files.

Global structure:

```
app/
components/
styles/
    reset.css
    variables.css
    typography.css
    utilities.css
    globals.css
```

Every reusable component must have its own CSS file.

Example:

```
components/
    Button/
        Button.tsx
        Button.css
    Navbar/
        Navbar.tsx
        Navbar.css
```

---

## BEM Methodology

All CSS must follow BEM.

Examples:

```
.button {}
.button--primary {}
.button--secondary {}

.card {}
.card__header {}
.card__body {}
.card__footer {}

.nav {}
.nav__item {}
.nav__link {}
.nav__link--active {}
```

Never write selectors like:

```
div div span {}
```

Avoid descendant selectors whenever possible.

Never style HTML tags directly except in reset.css.

Never use IDs for styling.

Keep selector specificity as low as possible.

---

## Design Tokens

Store all design values as CSS variables.

Example:

```
:root {

    --color-primary: #e894ff;
    --color-background: #23002b;

    --radius-small: 6px;
    --radius-medium: 14px;
    --radius-pill: 9999px;

    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 32px;

}
```

Never hardcode colors or spacing if a variable exists.

---

## Components

Components must be:

- Reusable
- Small
- Modular
- Single Responsibility

Extract repeated UI.

Never duplicate HTML.

Never duplicate CSS.

---

## Folder Structure

```
app/

components/

features/

services/

hooks/

lib/

utils/

types/

styles/

public/
```

---

## Next.js

Use App Router.

Use Server Components by default.

Use Client Components only when required.

Use next/image.

Use next/font.

Keep hydration minimal.

Avoid unnecessary useEffect.

---

## Code Quality

Write clean, maintainable code.

Follow SOLID principles.

Follow DRY.

Prefer composition over inheritance.

Split large components into smaller ones.

Keep files reasonably small.

Separate:

- UI
- Services
- Hooks
- Business Logic
- Utilities

Never mix API logic inside UI components.

---

## Accessibility

Always use semantic HTML.

Support keyboard navigation.

Use aria attributes when necessary.

Respect WCAG AA.

---

## Performance

Lazy load heavy components.

Optimize images.

Avoid unnecessary renders.

Keep CSS lightweight.

---

## General Rules

Always follow this DESIGN.md before generating UI.

Never generate Tailwind classes.

Never install Tailwind.

Never recommend Tailwind.

Never use Bootstrap.

Prioritize maintainability over speed of implementation.

Write code that another developer can understand immediately.

## SEO

Every page must define:

title

description

OpenGraph

Twitter Card

Canonical URL

## Comments

Avoid unnecessary comments.

Only comment complex business logic.

Never comment obvious code.

## Load
Every async component must support:

Loading

Empty

Success

Error

## Responsive
Mobile First.

Breakpoints:

576px

768px

992px

1200px

Never use fixed widths unless necessary.