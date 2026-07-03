document.querySelectorAll('[data-game="roulette"]').forEach((button) => {
  button.addEventListener('click', () => {
    postEvent('game_click', { game: 'roulette' });
  });
});
