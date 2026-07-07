# Animation Rules

Animations should feel fast and responsive.

Duration

100-250ms

Easing

ease-out

Never block user interaction.

Use CSS transitions whenever possible.

Avoid heavy JavaScript animations.

Examples

- button hover
- button press
- overlay open
- overlay close
- toast
- dropdown
- balance update

Game animations

Dice

Backend returns result.

Frontend only animates it.

Plinko

Backend returns complete path.

Frontend animates exactly that path.

Never generate game animations independently from backend data.

Animations should improve responsiveness, not delay it.
