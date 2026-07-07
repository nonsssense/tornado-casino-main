document.querySelectorAll('[data-game="crash"]').forEach((button) => {
  button.addEventListener('click', () => {
    postEvent('game_click', { game: 'crash' });
  });
});
