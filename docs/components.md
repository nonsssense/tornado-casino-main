# Tornado Component System

Every UI element should be built as a reusable component.

Never duplicate UI.

If a similar component already exists, extend it instead of creating a new one.

Components should be generic whenever possible.

Business logic should remain outside UI components.

---

# Component Principles

Every component should have:

- A single responsibility
- Clear inputs
- Predictable behavior
- Reusable styling
- Consistent naming

Components should be independent.

Avoid components that only work on one specific page.

---

# Component Hierarchy

Components are divided into three categories.

## Base Components

Reusable building blocks.

Examples:

- Button
- Input
- Select
- Dropdown
- Modal
- Card
- Badge
- Avatar
- Icon
- Loader
- Toast
- Divider

These components should never contain business logic.

---

## Shared Components

Reusable combinations of base components.

Examples:

- Header
- BottomNavigation
- Balance
- CoinSelector
- CurrencySelector
- SearchBar
- Banner
- EmptyState
- ConfirmationDialog

Shared components may contain simple UI behavior.

---

## Feature Components

Components specific to one feature.

Examples:

features/

wallet/

deposit/

withdraw/

dice/

plinko/

referrals/

profile/

Examples:

WalletCard

DepositForm

WithdrawForm

DiceBoard

PlinkoBoard

ReferralCard

These components should not be reused outside their feature unless they become generic.

---

# Component Composition

Always prefer composing existing components.

Good

Card

└── Button

└── Badge

└── Icon

Bad

Create a new custom component that duplicates Button and Badge behavior.

---

# Button

Button is one reusable component.

Variants:

- primary
- secondary
- ghost
- danger

States:

- default
- hover
- active
- disabled
- loading

Never create multiple button components for different pages.

Use variants instead.

---

# Card

Cards are reusable containers.

Cards should be used for:

- Games
- Wallet
- Promotions
- Transactions
- Statistics
- Bonuses

Cards should share the same visual language.

---

# Input

Input should support:

- text
- number
- password
- search

States:

- default
- focused
- error
- disabled

Do not create multiple input implementations.

---

# Modal

Modal is used for:

- confirmations
- alerts
- dialogs

Wallet-related screens should use fullscreen overlays instead of small centered modals.

---

# Overlay

Fullscreen overlays should be used for:

- Deposit
- Withdraw
- Wallet
- Transaction history

Opening an overlay should not navigate away from the current page.

---

# Navigation

Only one BottomNavigation component should exist.

It should be reused throughout the application.

Do not create page-specific navigation bars.

---

# Banner

Banner is a reusable promotional component.

It should support:

- image
- title
- subtitle
- CTA
- click action

Never hardcode promotional content.

---

# Game Card

GameCard is a reusable component.

It should support:

- thumbnail
- title
- subtitle
- RTP
- badges
- click action

Game cards should never contain game logic.

---

# Coin Selector

CoinSelector is reusable.

Supports:

- active state
- icon
- symbol

Examples:

USDT

BTC

ETH

TRX

USDC

SOL

---

# Dropdown

Dropdown should be reused everywhere.

Examples:

- Network
- Currency
- Language

Never create custom dropdowns for every page.

---

# Balance

Balance is a reusable component.

Should display:

- amount
- currency
- add button

Business logic must remain outside.

---

# Loading

One Loader component should exist.

Use it everywhere.

Avoid custom loading animations.

---

# Toast

One Toast component should exist.

Used for:

- Success
- Error
- Warning
- Information

Examples:

Deposit copied.

Withdrawal submitted.

Bonus activated.

---

# Empty States

One EmptyState component should exist.

Examples:

No transactions.

No bonuses.

No games.

Support:

- icon
- title
- description
- optional action

---

# Icons

Icons should come from a single icon library.

Avoid mixing multiple icon styles.

Crypto icons may use official branding.

Application icons remain monochrome.

---

# Assets

Brand assets must remain replaceable.

Never hardcode:

- logo
- banners
- illustrations

Load assets from a centralized location.

---

# Component Rules

Every component should:

- be reusable
- accept configurable props/options
- avoid duplicated styling
- avoid duplicated markup
- avoid business logic

If a component becomes useful in multiple places, move it into Shared Components.

---

# Before Creating a Component

Always ask yourself:

1. Does this component already exist?

2. Can I extend an existing component?

3. Can this become reusable later?

4. Is this UI-only?

If the answer is yes, reuse instead of rebuilding.

---

# Goal

The UI should be built from a small number of reusable components.

The same Button, Card, Modal, Input and Navigation components should power the entire application.

Consistency is more important than creating new components.
