// Only this fixed admin workflow may request a post-login destination. Never
// accept an arbitrary URL, reserved Sites path, protocol-relative or extra query.
export function loginDestination(search){const values=new URLSearchParams(search).getAll('next');return values.length===1&&values[0]==='/setup/import'?'/setup/import':'/process/index.html';}
