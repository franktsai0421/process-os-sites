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
// Geometry is sampled after the failure. No HTML, URLs, request data or text.
const failedBoards = new WeakMap();
export const failedBoardGeometry = error => failedBoards.get(error);
export async function screenshotBoard(page,path){
 for(let attempt=0;attempt<2;attempt++){
  try{await page.locator('.wf-admin').screenshot({path});return;}
  catch(error){
   if (!attempt && screenshotFailureKind(error) === 'DETACHED_TARGET') continue;
   if (screenshotFailureKind(error) === 'INVISIBLE_TARGET') {
    try {
     const geometry = await page.evaluate(() => {
      const boards = document.querySelectorAll('.wf-admin');
      const board = boards[0];
      const rect = board?.getBoundingClientRect();
      return {
       count: boards.length,
       viewport: [innerWidth, innerHeight],
       rect: rect ? [rect.x, rect.y, rect.width, rect.height].map(Math.round) : null,
       hidden: board ? getComputedStyle(board).visibility === 'hidden' || getComputedStyle(board).display === 'none' : null,
       accessSelected: document.querySelector('[data-queue-tab=access]')?.getAttribute('aria-selected') === 'true',
      };
     });
     failedBoards.set(error, geometry);
    } catch { /* The original capture error remains authoritative if the page closed. */ }
   }
   throw error;
  }
 }
}
