const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel:'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:3000/process/');
  await page.locator('[data-quick-login="admin"]').click();
  await page.goto('http://127.0.0.1:3000/process/?system=quality&view=data&dataTab=quality-routine-equipment');
  await page.locator('.routine-count').waitFor();
  await page.locator('[data-node-select="category"]').first().click();
  await page.locator('[data-node-select="subcategory"]').first().click();
  await page.locator('[data-node-select="group"]').first().click();
  await page.locator('.routine-equipment-list [data-equipment-view]').first().click();
  await page.locator('#routine-view-modal-backdrop').waitFor();

  const rules = await page.evaluate(() => {
    const photoContainer = document.querySelector('.routine-view-photo');
    const img = document.querySelector('.routine-view-photo img');
    const getRules = el => {
      const res = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && el.matches(rule.selectorText)) {
              res.push({ selector: rule.selectorText, cssText: rule.cssText });
            }
          }
        } catch {}
      }
      return res;
    };
    return {
      photoRules: getRules(photoContainer),
      imgRules: getRules(img)
    };
  });
  console.log(JSON.stringify(rules, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
