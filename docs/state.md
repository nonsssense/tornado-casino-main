# Frontend State

Frontend state should remain minimal.

## Server State

Always comes from backend.

- balance
- transactions
- deposit status
- wallet
- bonuses
- games
- banners
- session

Never cache permanently.

Always trust backend.

---

## Local UI State

Stored only in frontend.

Examples

- active overlay
- selected coin
- selected network
- opened dropdown
- current animation
- loading indicators
- form values

---

## Rules

Never duplicate backend state.

Never calculate balance locally.

Never persist sensitive data.

Frontend is responsible only for rendering.
