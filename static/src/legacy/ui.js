const ui = {
  bindButtons() {
    document.querySelectorAll('[data-event]').forEach((button) => {
      button.addEventListener('click', () => {
        const eventName = button.getAttribute('data-event');
        postEvent(eventName);
      });
    });

    document.querySelectorAll('[data-game]').forEach((button) => {
      button.addEventListener('click', () => {
        const game = button.getAttribute('data-game');
        postEvent('game_click', { game });
      });
    });

    document.querySelectorAll('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => {
        const nav = button.getAttribute('data-nav');
        document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        postEvent('nav_click', { nav });
      });
    });
  },
};
