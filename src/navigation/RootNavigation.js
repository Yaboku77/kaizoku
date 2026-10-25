import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

let lastNavTime = 0;
let lastTarget = '';

export function navigate(name, params) {
  const now = Date.now();
  const currentId = params?.animeId || params?.id || '';
  if (now - lastNavTime < 500 && lastTarget === `${name}_${currentId}`) {
    return;
  }
  if (now - lastNavTime < 350) {
    return;
  }
  lastNavTime = now;
  lastTarget = `${name}_${currentId}`;

  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}