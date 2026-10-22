// Miniflare's supported callback form keeps offline Workers deny-all without
// the native network-service configuration that reproduced a crash on this host.
// Do not inspect, log, forward or special-case the request or its credentials.
export async function denyLocalWorkerOutbound() {
  return new Response('Local Worker outbound network refused',{status:403});
}
