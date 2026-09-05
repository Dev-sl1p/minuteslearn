---

name: Academic Authority Redux

colors:

  surface: '#f8f9fa'

  surface-dim: '#d9dadb'

  surface-bright: '#f8f9fa'

  surface-container-lowest: '#ffffff'

  surface-container-low: '#f3f4f5'

  surface-container: '#edeeef'

  surface-container-high: '#e7e8e9'

  surface-container-highest: '#e1e3e4'

  on-surface: '#191c1d'

  on-surface-variant: '#5b403c'

  inverse-surface: '#2e3132'

  inverse-on-surface: '#f0f1f2'

  outline: '#8f706b'

  outline-variant: '#e4beb8'

  surface-tint: '#b81e17'

  primary: '#750002'

  on-primary: '#ffffff'

  primary-container: '#9f0406'

  on-primary-container: '#ffa89c'

  inverse-primary: '#ffb4a9'

  secondary: '#5f5e5e'

  on-secondary: '#ffffff'

  secondary-container: '#e2dfde'

  on-secondary-container: '#636262'

  tertiary: '#002a93'

  on-tertiary: '#ffffff'

  tertiary-container: '#003cc9'

  on-tertiary-container: '#adbbff'

  error: '#ba1a1a'

  on-error: '#ffffff'

  error-container: '#ffdad6'

  on-error-container: '#93000a'

  primary-fixed: '#ffdad5'

  primary-fixed-dim: '#ffb4a9'

  on-primary-fixed: '#410001'

  on-primary-fixed-variant: '#930004'

  secondary-fixed: '#e5e2e1'

  secondary-fixed-dim: '#c8c6c5'

  on-secondary-fixed: '#1c1b1b'

  on-secondary-fixed-variant: '#474746'

  tertiary-fixed: '#dde1ff'

  tertiary-fixed-dim: '#b8c4ff'

  on-tertiary-fixed: '#001454'

  on-tertiary-fixed-variant: '#0037ba'

  background: '#f8f9fa'

  on-background: '#191c1d'

  surface-variant: '#e1e3e4'

  surface-subtle: '#F2F2F2'

  text-primary: '#000000'

  text-secondary: '#4B5563'

typography:

  headline-xl:

    fontFamily: Kanit

    fontSize: 48px

    fontWeight: '700'

    lineHeight: 56px

    letterSpacing: -0.02em

  headline-xl-mobile:

    fontFamily: Kanit

    fontSize: 32px

    fontWeight: '700'

    lineHeight: 40px

  headline-lg:

    fontFamily: Kanit

    fontSize: 32px

    fontWeight: '700'

    lineHeight: 40px

  headline-md:

    fontFamily: Kanit

    fontSize: 24px

    fontWeight: '600'

    lineHeight: 32px

  body-lg:

    fontFamily: Kanit

    fontSize: 18px

    fontWeight: '400'

    lineHeight: 28px

  body-md:

    fontFamily: Kanit

    fontSize: 16px

    fontWeight: '400'

    lineHeight: 24px

  label-md:

    fontFamily: Kanit

    fontSize: 14px

    fontWeight: '600'

    lineHeight: 20px

    letterSpacing: 0.01em

  caption:

    fontFamily: Kanit

    fontSize: 12px

    fontWeight: '400'

    lineHeight: 16px

rounded:

  sm: 0.5rem

  DEFAULT: 1rem

  md: 1.5rem

  lg: 2rem

  xl: 3rem

  full: 9999px

spacing:

  margin-mobile: 1rem

  margin-desktop: 5rem

  gutter: 1.5rem

  stack-lg: 4rem

  stack-md: 2rem

  stack-sm: 1rem

---

## Brand & Style

The design system embodies a **Modern Corporate** aesthetic tailored for the educational sector. It balances academic rigor with contemporary digital usability, focusing on clarity, trust, and direct action. The brand personality is professional yet accessible, avoiding excessive ornamentation in favor of high-contrast layouts and precise typography.

Visual cues are drawn from minimalist utility:

- **Cleanliness:** Ample whitespace to reduce cognitive load for learners.

- **Authority:** A bold primary red paired with dark neutrals to signify importance and "academic excellence."

- **Clarity:** A structured hierarchy that prioritizes the learning objective over decorative elements.

## Colors

The palette is anchored by a deep **Academic Red (#9F0406)**, used specifically for primary actions and brand identity. 

- **Primary:** Reserved for high-impact buttons and critical UI states.

- **Secondary:** A deep, near-black neutral for typography and primary navigation elements.

- **Neutral:** A range of cool grays and off-whites to define content containers and background surfaces.

- **Functional:** Interactions utilize high contrast (white text on red backgrounds) to ensure immediate legibility.

## Typography

This design system utilizes **Kanit** for headlines and body copy to provide clear Thai + Latin readability across the learning platform. 

- Headlines use bold weights and tighter letter-spacing for a commanding presence.

- Body text maintains a generous line height to improve the reading experience for educational content.

- For mobile, headline sizes are aggressively scaled down to maintain visual balance on narrow viewports.

## Layout & Spacing

The system follows a **Fluid Grid** model with a focus on vertical stacking. 

- **Desktop:** A 12-column grid with wide 5rem margins to keep content centered and focused.

- **Mobile:** A 4-column grid with 1rem margins.

- **Rhythm:** Vertical spacing relies on a "Stack" philosophy. `stack-lg` separates major page sections (e.g., Header from Hero), while `stack-sm` handles tight relationships like labels and their respective inputs.

## Elevation & Depth

To maintain a "Professional/Modern" feel, depth is created through **Tonal Layering** rather than traditional shadows.

- **Level 0:** The main background (#F8F9FA).

- **Level 1:** Content cards and containers use a pure white (#FFFFFF) surface to "pop" against the subtle neutral background.

- **Interaction Depth:** Subtle, extra-diffused low-opacity shadows (4% opacity black) are permitted only on active card hover states to indicate interactability.

- **Outlines:** Low-contrast borders (#E5E7EB) are used to define inputs and secondary containers, keeping the interface flat and lightweight.

## Shapes

The design system adopts a **Pill-shaped** (roundedness: 3) strategy for buttons and interactive elements, echoing the branding found in the reference website. This choice softens the "Academic" authority, making the platform feel more like a modern tech-first learning tool. 

- Buttons use full pill-rounding.

- Cards and containers use `rounded-lg` (2rem) for a cohesive, friendly appearance.

- Logos and avatars are contained within soft-rectangles or circles to maintain consistency.

## Components

### Buttons

- **Primary:** Solid #9F0406 with white text. High-contrast, pill-shaped.

- **Secondary:** Outlined or soft-gray background (#F2F2F2). Used for "Buy Course" or secondary actions.

- **Tertiary:** Text-only with an underline or bold weight for navigation links.

### Input Fields

- Fields use a subtle gray background and a 2px bottom-border or full outline that thickens and changes to the primary red on focus.

- Placeholder text uses the `caption` typography level in a medium-gray tone.

### Cards

- White background with `rounded-lg` corners. 

- Content within cards should follow the vertical spacing tokens `stack-sm`) for padding.

### Chips & Tags

- Used for course categories or license status. These are small, pill-shaped elements with a soft-tint background (e.g., 10% opacity of the primary color) and bold text.

### Navigation

- Top-bar is fixed-height (64px) with a clean logo placement on the left and primary CTA (e.g., "Login") on the right.