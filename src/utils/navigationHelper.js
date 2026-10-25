let lastNavTime = 0;
let lastScreen = '';
let lastId = null;

/**
 * Throttles navigation to prevent duplicate pushes and stuck UI when a user taps
 * repeatedly or rapidly on cards, tabs, or buttons.
 */
export function safeNavigate(navigation, screen, params) {
  const now = Date.now();
  const currentId = params?.animeId || params?.id || '';

  // Prevent duplicate taps to the same screen + item within 650ms
  if (now - lastNavTime < 650 && screen === lastScreen && currentId === lastId) {
    return;
  }
  // Prevent spamming any navigation transitions faster than 350ms
  if (now - lastNavTime < 350) {
    return;
  }

  lastNavTime = now;
  lastScreen = screen;
  lastId = currentId;

  if (navigation && typeof navigation.navigate === 'function') {
    navigation.navigate(screen, params);
  }
}

export function safeReplace(navigation, screen, params) {
  const now = Date.now();
  if (now - lastNavTime < 350) return;
  lastNavTime = now;
  if (navigation && typeof navigation.replace === 'function') {
    navigation.replace(screen, params);
  }
}
