/* Loopback acceptance adapter only. Never used by the daily server. */
function requestHeaders(input,sessions){
 const headers=new Headers(input);headers.delete('host');headers.delete('content-length');
 const explicit=headers.get('x-fixture-user');
 if(explicit){if(!sessions[explicit])throw Error('UNKNOWN_FIXTURE_USER');for(const [key,value]of Object.entries(sessions[explicit]))headers.set(key,value);return headers;}
 const cookies=(headers.get('cookie')||'').split(';').map(c=>c.trim()),normal=cookies.find(c=>c.startsWith('process_demo=')),fixture=cookies.find(c=>c.startsWith('ipqc_fixture_session='));
 // Normal signed login takes precedence. Anonymous requests remain anonymous.
 if(!normal&&fixture)headers.set('Cookie',fixture.replace('ipqc_fixture_session=','process_demo='));
 return headers;
}
function responseHeaders(response,pathname){
 const headers=Object.fromEntries(response.headers),cookies=response.headers.getSetCookie();
 if(pathname==='/api/platform-login'&&response.ok)cookies.push('ipqc_fixture_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
 if(cookies.length)headers['set-cookie']=cookies;
 return headers;
}
module.exports={requestHeaders,responseHeaders};
