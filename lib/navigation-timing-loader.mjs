import {navigationTimingClient} from './navigation-timing-client.mjs';
// Inline the self-contained, opt-in recorder: no extra HTTP request in either mode.
export const navigationTimingLoader='('+navigationTimingClient.toString()+')();';
if(/<\/script/i.test(navigationTimingLoader))throw Error('TIMING_INLINE_BOUNDARY');
