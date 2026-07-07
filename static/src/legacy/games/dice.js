document.querySelectorAll('[data-game="dice"]').forEach((button) => {
  button.addEventListener('click', () => {
    postEvent('game_click', { game: 'dice' });
  });
});
