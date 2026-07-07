# Tornado UI & Design System

You are designing the frontend for Tornado, a Telegram Mini App crypto casino.

The goal is NOT to create a flashy casino interface.

The goal is to build an interface that feels:

- Fast
- Simple
- Trustworthy
- Modern
- Lightweight

Every design decision should reinforce these principles.

---

# Brand Philosophy

Tornado is built around three core values.

## Speed

Everything should feel instant.

The interface should minimize the number of clicks and interactions.

Users should feel that they can:

Open → Play → Leave

within seconds.

Avoid unnecessary navigation.

Avoid additional confirmation screens whenever possible.

Prefer overlays instead of opening new pages.

---

## Simplicity

The interface must feel effortless.

Users should immediately understand what to do.

Avoid unnecessary decorations.

Avoid visual clutter.

Every element must have a purpose.

Design should communicate:

"I already know how to use this."

---

## Trust

The interface should communicate reliability.

Players should always understand:

- where they are
- what is happening
- what action they are performing

Use clear layouts.

Use consistent spacing.

Avoid flashy casino aesthetics.

Trust is built through consistency.

---

# Overall Style

The UI should feel like a modern Telegram-native crypto application.

Not a luxury casino.

Not Material Design.

Not iOS.

Not Bootstrap.

Not Web3 hype.

Instead the interface should feel:

- clean
- responsive
- lightweight
- premium through simplicity
- calm
- confident

---

# Design Principles

Always prioritize:

- Mobile First
- Speed First
- Simplicity
- Readability
- Clear hierarchy
- Consistency
- Functional UI
- Reusable components

Never add visual complexity unless it improves usability.

---

# Layout

The MVP targets mobile devices.

Design everything mobile-first.

Desktop exists only as a preview during development.

Avoid desktop-specific layouts.

---

# Color Palette

Primary Background

#15171A

Primary Accent

#FCD312

Neutral

White

Black

Different opacity levels of the accent color may be used for:

- borders
- outlines
- hover states
- glow
- subtle highlights

Do not overuse the accent color.

Yellow should guide attention, not dominate the interface.

---

# Cards

Cards should have a slightly lighter background than the page.

Use subtle contrast.

Avoid large shadows.

Rounded corners.

Minimal borders.

Cards should separate information without adding visual noise.

---

# Shadows & Glow

Most UI should rely on contrast instead of shadows.

Use subtle shadows only to improve depth.

Yellow glow is reserved for:

- fullscreen overlays
- deposit screen
- withdrawal screen
- important highlighted elements

Glow should remain soft and elegant.

Avoid dramatic effects.

---

# Border Radius

Primary radius:

15px

Use the same radius consistently throughout the application.

---

# Typography

Preferred font:

Inter

Alternative:

Geist

Typography should feel modern, readable and compact.

Avoid oversized headings.

Keep text hierarchy simple.

---

# Icons

Application icons should be:

- simple
- minimal
- monochrome

Cryptocurrency icons may keep their official colors.

Logos should always remain replaceable assets.

Never hardcode brand graphics into components.

---

# Buttons

Primary Button

- Yellow background
- Dark text
- Rounded corners

Secondary Button

- Dark background
- Thin yellow border

Ghost Button

- Transparent background
- Yellow text

Disabled Button

- Reduced opacity
- No glow

Buttons should feel lightweight and responsive.

Avoid oversized buttons.

---

# Inputs

Inputs should:

- blend naturally with the interface
- have rounded corners
- use subtle borders
- have clear focus states

Avoid heavy outlines.

---

# Navigation

Bottom navigation should always remain visible.

Navigation should feel predictable.

Important actions should always stay within thumb reach.

---

# Overlay Philosophy

Deposit

Withdraw

Wallet

History

should NOT navigate away from the current screen.

Instead they should open as fullscreen overlays or modal screens.

Users should always feel they remain inside the application.

---

# Dynamic Content

The following areas must always be dynamic:

- Bonus banners
- Promotions
- Game cards
- Featured games
- Wallet information
- User balance

Never hardcode promotional content.

---

# Game Cards

Game cards are reusable components.

Initially placeholders are acceptable.

Eventually each card will display:

- Thumbnail
- Title
- Labels
- Promotional badges
- Status

Cards always act as buttons.

---

# Components

Everything should be component-based.

Examples:

- Button
- Input
- Card
- Modal
- Overlay
- Header
- BottomNavigation
- WalletCard
- BonusCard
- PromotionCard
- GameCard
- CoinSelector
- CurrencySelector
- Dropdown
- Balance
- Toast
- Loader

Avoid duplicate components.

---

# Animations

Animations should be subtle.

Prefer:

- Fade
- Opacity
- Slide

Avoid:

- Bounce
- Elastic
- Excessive scaling

The interface should feel fast rather than animated.

---

# Spacing

Use an 8px spacing system.

Typical spacing values:

4

8

12

16

24

32

48

Maintain consistent spacing across the application.

---

# Visual Hierarchy

Primary attention:

- Balance
- Active buttons
- Primary actions

Secondary attention:

- Cards
- Inputs
- Promotions

Background elements should never compete with primary actions.

---

# Existing Designs

Existing Figma designs should be treated as the primary reference.

They represent the intended layout and interaction flow.

However, they are not considered final.

You may improve:

- spacing
- alignment
- button proportions
- typography
- shadows
- hover states
- borders
- visual consistency
- readability
- responsiveness

Do NOT redesign the application into a different visual language.

Every improvement should preserve Tornado's identity.

---

# Design Goal

Every screen should make the user feel:

"I can do what I came here to do immediately."

The interface should communicate:

Speed.

Simplicity.

Trust.

Nothing more.
