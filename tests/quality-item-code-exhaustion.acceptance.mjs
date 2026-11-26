import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
import {cases,seed} from './quality-item-code-compiled-fixture.mjs';

const addItem = {fqc:'#fqc-add-item', iqc:'[data-add-item="error0"]', 'ipqc-ab':'#ipqcab-add-item', 'ipqc-c':'[data-ipqcc-add="item"]'};

function occupyAllSuffixes(values, config) {
  seed(values);
  const control = JSON.parse(values[config.key], (_key, snapshot) => {
    if (!Array.isArray(snapshot?.errors) || !Array.isArray(snapshot.items)) return snapshot;
    const parent = snapshot.errors.find(row => row.id === config.id);
    const sample = snapshot.items.find(row => row.errorId === parent?.id);
    if (!sample) return snapshot;
    const field = 'checkNo' in sample ? 'checkNo' : 'code';
    snapshot.items = snapshot.items.filter(row => row.errorId !== parent.id);
    for (let number = 1; number <= 99; number++) {
      const suffix = String(number).padStart(2, '0');
      snapshot.items.push({...sample, id:`synthetic-${parent.code}-${suffix}`, [field]:`${parent.code}-${suffix}`});
    }
    return snapshot;
  });
  values[config.key] = JSON.stringify(control);
}

for (const config of cases) for (const language of ['zh', 'vi']) {
  test(`${config.module} ${config.line || ''} ${language} shows all 99 numbers occupied and preserves them`, async t => {
    const fixture = await createABCFixture({products:1, decorate:values => occupyAllSuffixes(values, config)});
    t.after(() => fixture.close());
    const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined});
    t.after(() => browser.close());
    const origin = fixture.url.origin;
    const narrow = process.env.QUALITY_TEST_CROSSOVER === '1' ? language === 'zh' : language === 'vi';
    const context = await browser.newContext({serviceWorkers:'block',viewport:narrow?{width:390,height:844}:{width:1365,height:900}});
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(lang => localStorage.setItem('processUILanguage',lang), language);
    await context.addCookies([{name:'process_demo',value:fixture.cookie('frank'),url:origin}]);
    const page = await context.newPage();
    const readState = () => fixture.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
    await page.goto(`${origin}/process/?system=quality&view=data&dataTab=quality-${config.module}`);
    if (config.module === 'iqc') await page.locator('[data-select-part=P1]').click();
    if (config.line === 'B') await page.locator('#ipqcab-line').selectOption('B');
    const before = await readState();
    await page.locator(addItem[config.module]).first().click();
    const field = page.locator('[data-quality-item-code]');
    assert.match(await field.locator('[role=status]').innerText(), language === 'vi' ? /đã dùng hết 01–99/i : /01–99 已用完/);
    const suffix = field.locator('[data-code-suffix]');
    assert.equal(await suffix.inputValue(), '');
    for (const selector of ['[name=name]', '[name=nameVi]', '[name=standard]', '#ab-standard']) {
      const name = page.locator(selector).filter({visible:true});
      if (await name.count()) await name.first().fill('Synthetic item');
    }
    if (config.module === 'ipqc-c') await page.locator('[name=ruleCadence]').selectOption('none');
    await suffix.fill('99');
    const form = config.line ? page.locator('.ipqcab-dialog') : field.locator('xpath=ancestor::form[1]');
    await form.locator('[type=submit],#ab-apply').last().click();
    assert.equal(await suffix.evaluate(el => el.validity.valid), false);
    assert.ok(await field.isVisible());
    assert.deepEqual(await readState(), before);
  });
}
