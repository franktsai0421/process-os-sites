// Test-only measurements. No product instrumentation, credentials or bodies in reports.
import assert from 'node:assert/strict';

export const REQUIRED_SAMPLES = 5;
export function summarizeActions(samples, expectedActions, repetitions = REQUIRED_SAMPLES) {
  assert.equal(repetitions, REQUIRED_SAMPLES, 'Acceptance requires five independent cycles');
  assert.equal(new Set(expectedActions).size, expectedActions.length, 'Duplicate action id');
  assert(samples.every(sample => expectedActions.includes(sample.action)), 'Unregistered action sample');
  return expectedActions.map(action => {
    const rows = samples.filter(sample => sample.action === action);
    const cycles = rows.map(row => row.cycle);
    assert.equal(new Set(cycles).size, cycles.length, 'Duplicate action/cycle');
    assert(cycles.every(cycle => Number.isSafeInteger(cycle) && cycle >= 1 && cycle <= repetitions));
    const passed = rows.filter(row => row.status === 'PASS');
    for (const row of passed) {
      assert(row.layer === 'CI_SYNTHETIC_BROWSER', 'API/VM timings cannot fill UI results');
      assert(Number.isFinite(row.ms) && row.ms >= 0);
      assert.equal(row.stateVerified, true, 'Timing without a correct state is not a pass');
      assert.equal(row.mandatoryClick, true, 'Missing/optional branch is not a sample');
      assert.equal(row.networkComplete, true, 'Unfinished response accounting');
    }
    const complete = passed.length === repetitions && rows.length === repetitions;
    const times = complete ? passed.map(row => row.ms).sort((a, b) => a - b) : [];
    return {
      action, layer: 'CI_SYNTHETIC_BROWSER', status: complete ? 'PASS_FUNCTION_MEASURED' : rows.some(row => row.status === 'FAIL') ? 'FAIL' : 'NOT_COMPLETE',
      samples: passed.length, requiredSamples: repetitions,
      medianMs: complete ? times[2] : null, maxMs: complete ? times[4] : null,
      medianOver1000ms: complete ? times[2] > 1000 : null,
      maxOver1000ms: complete ? times[4] > 1000 : null,
      requests: complete ? passed.map(row => ({cycle: row.cycle, ...row.requests})) : null,
    };
  });
}

export async function requiredClick(page, selector) {
  const target = page.locator(selector);
  assert.equal(await target.count(), 1, 'Exactly one required control: ' + selector);
  assert.equal(await target.isVisible(), true, 'Required control hidden: ' + selector);
  assert.equal(await target.isEnabled(), true, 'Required control disabled: ' + selector);
  // Capture the real DOM click, not the time automation started locating the button.
  await page.evaluate(selector => {
    if (window.__draftAcceptanceClick) throw Error('Previous measurement not consumed');
    const record = {selector, at: null};
    const listener = event => {
      if (event.target instanceof Element && event.target.closest(selector)) {
        record.at = performance.now(); document.removeEventListener('click', listener, true);
      }
    };
    record.dispose = () => document.removeEventListener('click', listener, true);
    window.__draftAcceptanceClick = record;
    document.addEventListener('click', listener, true);
  }, selector);
  await target.click();
}

export async function browserReadyTime(page) {
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const mark = window.__draftAcceptanceClick;
    if (!mark || !Number.isFinite(mark.at)) throw Error('Required click never occurred');
    const ms = performance.now() - mark.at;
    mark.dispose(); delete window.__draftAcceptanceClick;
    return ms;
  });
}

export function captureRequests(page, origin, {responseDeadlineMs = 5000} = {}) {
  assert(Number.isSafeInteger(responseDeadlineMs) && responseDeadlineMs >= 0 && responseDeadlineMs <= 10000);
  const entries = new Map(), completions = new Map(), finishers = new Map();
  const request = req => {
    const url = new URL(req.url());
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return;
    entries.set(req, {method: req.method(), path: url.pathname, queryEmpty: url.search === '', status: null, observedBodyContract: null, requestBytes: Buffer.byteLength(req.postData() || ''), responseBytes: null, failed: false, clientTiming: null, serverTiming: null});
    completions.set(req, new Promise(resolve => finishers.set(req, resolve)));
  };
  const response = res => {
    const row = entries.get(res.request());
    if (!row) return;
    row.status = res.status();
    void (async () => {
      try {
        const body = await res.body(); row.responseBytes = body.length;
        // Preserve only this bounded known body contract, never response content.
        // A 404 alone, a receipt query or an additional JSON field is not proof.
        if (row.method === 'GET' && row.path === '/api/routine-fqc' && row.queryEmpty && row.status === 404 && body.length <= 64) {
          if (body.toString('utf8') === '{"error":"FQC_NOT_ENABLED"}') row.observedBodyContract = 'FQC_NOT_ENABLED_ONLY';
        }
        const timing = res.request().timing?.();
        if (timing) row.clientTiming = Object.fromEntries(['startTime', 'domainLookupStart', 'domainLookupEnd', 'connectStart', 'secureConnectionStart', 'connectEnd', 'requestStart', 'responseStart', 'responseEnd'].filter(key => Number.isFinite(timing[key])).map(key => [key, timing[key]]));
        // Missing Server-Timing is null, not invented DB/CPU duration.
        const header = await res.headerValue?.('server-timing');
        if (typeof header === 'string') row.serverTiming = header.slice(0, 512);
      } catch { row.failed = true; }
      finally { finishers.get(res.request())?.(); }
    })();
  };
  const failed = req => { const row = entries.get(req); if (row) { row.failed = true; finishers.get(req)?.(); } };
  page.on('request', request); page.on('response', response); page.on('requestfailed', failed);
  let stopped = false;
  return async () => {
    assert.equal(stopped, false, 'Request window already closed'); stopped = true;
    // Close request admission at the UI-ready boundary, but finish accounting for
    // responses to those already admitted requests. This drain is outside UI ms.
    page.off('request', request);
    let timer;
    await Promise.race([Promise.all(completions.values()), new Promise(resolve => { timer = setTimeout(resolve, responseDeadlineMs); })]);
    clearTimeout(timer); page.off('response', response); page.off('requestfailed', failed);
    const rows = [...entries.values()];
    return {
      networkComplete: rows.every(row => row.failed || row.status !== null && row.responseBytes !== null),
      requests: {GET: rows.filter(row => row.method === 'GET').length, POST: rows.filter(row => row.method === 'POST').length,
        other: rows.filter(row => !['GET', 'POST'].includes(row.method)).length,
        requestBytes: rows.reduce((n, row) => n + row.requestBytes, 0),
        responseBytes: rows.reduce((n, row) => n + (row.responseBytes || 0), 0), rows},
    };
  };
}

export async function measureAction({page, origin, action, cycle, selector, ready, verify, samples, expectedPost, disabledRoutineBackground}) {
  const stop = captureRequests(page, origin);
  let outcome, error, network;
  try {
    await requiredClick(page, selector);
    await ready();
    const ms = await browserReadyTime(page);
    network = await stop();
    assert.equal(network.networkComplete, true, 'Incomplete action request accounting');
    const failedRows = network.requests.rows.filter(row => row.failed || row.status >= 400);
    let allowDisabledBadge = false;
    if (failedRows.length && ['return-confirm', 'approve-confirm'].includes(action) && expectedPost === 1 &&
      disabledRoutineBackground?.seedDisabled === true && disabledRoutineBackground.before === true && typeof disabledRoutineBackground.current === 'function') {
      allowDisabledBadge = await disabledRoutineBackground.current() === true;
    }
    for (const row of failedRows) {
      assert(allowDisabledBadge && !row.failed && row.method === 'GET' && row.path === '/api/routine-fqc' && row.queryEmpty === true &&
        row.status === 404 && row.observedBodyContract === 'FQC_NOT_ENABLED_ONLY', 'Unexpected failed API in successful action');
      row.classification = 'EXPECTED_DISABLED_BACKGROUND';
    }
    if (expectedPost !== undefined) assert.equal(network.requests.POST, expectedPost, 'Unexpected POST count for ' + action);
    // Authoritative DB inspection is a correctness oracle, outside the UI timing window.
    await verify();
    outcome = {action, cycle, layer: 'CI_SYNTHETIC_BROWSER', status: 'PASS', ms, stateVerified: true, mandatoryClick: true};
  } catch (caught) {
    error = caught;
    outcome = {action, cycle, layer: 'CI_SYNTHETIC_BROWSER', status: 'FAIL', ms: null, stateVerified: false, mandatoryClick: false};
  }
  if (!network) network = await stop();
  samples.push({...outcome, ...network});
  if (error) throw error;
  return samples.at(-1);
}
