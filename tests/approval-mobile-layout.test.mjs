import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import postcss from 'postcss';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';

const read = file => readFileSync(new URL('../public/process/' + file, import.meta.url), 'utf8');
const approvalCss = postcss.parse(read('approval-tabs.css'));
const shellTitle = '.app-shell > main:has(> #view-root .approval-page) > .topbar';
const tabs = '.approval-page .approval-tabs';

function declarationsAt(selector, width) {
  const values = {};
  approvalCss.walkRules(selector, rule => {
    const limit = rule.parent.type === 'atrule'
      ? Number(rule.parent.params.match(/max-width:\s*(\d+)px/)?.[1])
      : Infinity;
    if (width <= limit) rule.walkDecls(({prop, value}) => { values[prop] = value; });
  });
  return values;
}

void test('mobile approval CSS lets the title shrink and keeps two wrapping tab columns and count badges', () => {
  for (const width of [320, 375, 390, 430]) {
    assert.equal(declarationsAt(shellTitle, width).height, 'auto');
    assert.equal(declarationsAt(shellTitle + ' > :has(> #page-title)', width)['min-inline-size'], '0');
    assert.equal(declarationsAt(shellTitle + ' #page-title', width)['overflow-wrap'], 'anywhere');
    assert.equal(declarationsAt('.app-shell .sidebar .nav-item[data-view="approval"]', width)['white-space'], 'normal');
    assert.equal(declarationsAt(tabs, width)['grid-template-columns'], 'repeat(2, minmax(0, 1fr))');
    assert.equal(declarationsAt(tabs + ' [role="tab"]', width)['white-space'], 'normal');
    assert.equal(declarationsAt(tabs + ' [role="tab"]', width)['min-height'], '44px');
    assert.equal(declarationsAt(tabs + ' [role="tab"] > span:first-child', width)['min-inline-size'], '0');
    assert.equal(declarationsAt('.approval-tab-count', width)['flex-shrink'], '0');
    assert.equal(declarationsAt('#approval-panel-quality .quality-review-status-card', width)['grid-template-columns'], 'minmax(0, 1fr) auto');
    assert.equal(declarationsAt('.approval-page .approval-stats', width)['grid-template-columns'], 'repeat(3, minmax(0, 1fr))');
  }
  assert.deepEqual(declarationsAt(shellTitle, 1280), {});
  assert.deepEqual(declarationsAt(tabs, 1280), {});
  assert.equal(declarationsAt('.approval-tabs', 1280).display, 'flex');
  assert.match(read('index.html'), /approval-tabs\.css\?v=20261119-mobile1/);
});

void test('approval mounts the full Chinese and Vietnamese labels in every selected section with independent counts', () => {
  const labelsByLocale = {
    zh: ['主資料送審', '製程版本確認', '品質系統資料庫', '例行檢查'],
    vi: ['Duyệt dữ liệu gốc', 'Duyệt phiên bản quy trình', 'Cơ sở dữ liệu chất lượng', 'Kiểm tra định kỳ'],
  };
  const tabs = ['master', 'process', 'quality', 'routine'];
  for (const [lang, labels] of Object.entries(labelsByLocale)) {
    for (const selected of tabs) {
      const {document} = canvasDOM();
      document.documentElement.lang = lang;
      const window = {};
      runInNewContext(read('approval-tabs.js'), {window, document, MutationObserver: class { observe() {} }});
      const page = document.createElement('section');
      page.appendChild = node => page.append(node);
      const state = {approvalTab: selected};
      window.ApprovalTabs.mount({page, state, masterHTML: '', masterPending: 0, processPending: 15, qualityPending: 100, routinePending: 2});
      for (const [index, tab] of tabs.entries()) {
        const button = page.querySelector('#approval-tab-' + tab);
        const panel = page.querySelector('#approval-panel-' + tab);
        assert.equal(button.firstElementChild.textContent, labels[index]);
        assert.equal(button.lastElementChild.textContent, ['0','15','100','2'][index]);
        assert.equal(button.getAttribute('aria-selected'), String(selected === tab));
        assert.equal(button.getAttribute('aria-controls'), panel.id);
        assert.equal(panel.hidden, selected !== tab);
      }
    }
  }
  assert.ok(read('i18n.js').includes('"版本確認平台":"Duyệt phiên bản","製程版本確認平台":"Nền tảng duyệt phiên bản quy trình"'));
  assert.ok(read('master-data.js').includes("'Cơ sở dữ liệu chất lượng':'品質系統資料庫'"));
  assert.ok(read('routine-fqc.js').includes("'例行檢查送審', 'Duyệt kiểm tra định kỳ'"));
  assert.ok(read('routine-iqc.js').includes("'例行 IQC 送審','Duyệt IQC định kỳ'"));
});
