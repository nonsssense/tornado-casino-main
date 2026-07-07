/**
 * Full-screen authentication error UI (bootstrap only).
 * Shown when silent login fails; not part of the main application shell.
 */

const SCREEN_ID = 'auth-error-screen';

/**
 * @param {{ onRetry: () => void }} options
 */
export function showAuthError({ onRetry }) {
  const mountTarget = document.getElementById('app-root');
  if (!mountTarget) {
    return;
  }

  mountTarget.replaceChildren();

  const screen = document.createElement('div');
  screen.id = SCREEN_ID;
  screen.setAttribute('role', 'alert');
  screen.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:#000',
    'color:#fff',
    'padding:24px',
    'box-sizing:border-box',
    'font-family:Inter,system-ui,sans-serif',
  ].join(';');

  const content = document.createElement('div');
  content.style.cssText = 'max-width:320px;text-align:center;';

  const title = document.createElement('h1');
  title.textContent = 'Unable to authenticate';
  title.style.cssText = 'margin:0 0 12px;font-size:22px;font-weight:600;line-height:1.3;';

  const subtitle = document.createElement('p');
  subtitle.textContent =
    "Sorry, we couldn't authenticate your account. Please close the application and try again.";
  subtitle.style.cssText = 'margin:0 0 24px;font-size:15px;line-height:1.5;color:#b3b3b3;';

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.textContent = 'Retry';
  retryButton.style.cssText = [
    'appearance:none',
    'border:1px solid #fff',
    'background:transparent',
    'color:#fff',
    'font-size:15px',
    'font-weight:500',
    'padding:10px 28px',
    'border-radius:8px',
    'cursor:pointer',
  ].join(';');

  retryButton.addEventListener('click', () => {
    retryButton.disabled = true;
    onRetry();
  });

  content.append(title, subtitle, retryButton);
  screen.appendChild(content);
  mountTarget.appendChild(screen);
}

export function clearAuthError() {
  const screen = document.getElementById(SCREEN_ID);
  screen?.remove();
}
