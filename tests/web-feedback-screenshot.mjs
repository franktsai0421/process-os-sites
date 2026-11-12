// Retry only a detached screenshot target after an asynchronous board redraw.
// Never replay browser interactions, requests, writes or assertions.
export function screenshotFailureKind(error){
 const message=String(error?.message||'');
 if(/element (?:is |was )?not attached|element (?:has been |was )?detached|detached from (?:the )?DOM/i.test(message))return 'DETACHED_TARGET';
 if(/not visible|not in the viewport|outside of the viewport/i.test(message))return 'INVISIBLE_TARGET';
 if(/timeout/i.test(message))return 'TIMEOUT';
 if(/strict mode violation/i.test(message))return 'NON_UNIQUE_TARGET';
 if(/screenshot|captureScreenshot/i.test(message))return 'SCREENSHOT_ERROR';
 return 'OTHER';
}
export async function screenshotBoard(page,path){
 for(let attempt=0;attempt<2;attempt++){
  try{await page.locator('.wf-admin').screenshot({path});return;}
  catch(error){if(attempt||screenshotFailureKind(error)!=='DETACHED_TARGET')throw error;}
 }
}
