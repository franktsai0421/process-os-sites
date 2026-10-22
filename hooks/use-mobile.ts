import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
function subscribeMobile(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const getMobileSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT;
const getServerSnapshot = () => false;
export function useIsMobile() {
  return React.useSyncExternalStore(subscribeMobile, getMobileSnapshot, getServerSnapshot);
}
