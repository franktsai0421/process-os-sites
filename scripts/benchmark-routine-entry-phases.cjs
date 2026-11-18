// Paired GETs against the same isolated SQLite / Map R2 snapshot.
// Only aggregate counts, bytes and timings leave the fixture.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fixture = require('./fqc-apply-fixture.cjs');
const loader = require('./fqc-bootstrap-projection-fixture.cjs');
const predecessor = 'e719d3e941681281df1f317038c5a7c5223e19ab';
const coreFile = 'lib/process-state.ts';
const routeFile = 'app/api/routine-fqc/route.ts';
const clock = () => performance.now();
const sleep = (ms) =>
  ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

function union(intervals) {
  let total = 0,
    cursor = 0;
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, end - Math.max(cursor, start));
    cursor = Math.max(cursor, end);
  }
  return total;
}

function timed(object, key, observe) {
  const original = object[key];
  object[key] = async (...args) => {
    const start = clock();
    const result = await original(...args);
    observe(start, clock());
    return result;
  };
}

async function main() {
  const f = await fixture();
  try {
    const routine = f.load('lib/routine-fqc.ts');
    await f.mutate((values) => {
      const users = JSON.parse(values.platformUsers);
      for (const permission of Object.keys(users[0].accessOverrides))
        users[0].accessOverrides[permission] = true;
      values.platformUsers = JSON.stringify(users);
      values.routineFqcEnabled = '1';
      const quality = JSON.parse(values.qualityMasterControl);
      const active = quality.libraries.fqc.versions[0];
      active.updatedAt = '2026-01-01T00:00:00Z';
      active.snapshot.items = Array.from({ length: 80 }, (_, i) => ({
        ...active.snapshot.items[0],
        id: 'entry-' + i,
        rule: { cadence: 'time', timeFrequency: 'monthly' },
      }));
      values.qualityMasterControl = JSON.stringify(quality);
      const sources = routine.routineSources({ values }),
        control = routine.emptyRoutine();
      const day = '2026-11-01';
      control.jobs = routine.schedulePreview(control, sources, day, day);
      assert.equal(control.jobs.length, 80);
      routine.executeRoutine(
        control,
        {
          action: 'create-plan',
          jobIds: [control.jobs[0].id],
          operationId: 'synthetic-plan',
          expectedRevision: control.revision,
        },
        sources,
        {
          actor: { id: 'editor', name: 'Synthetic', admin: true },
          at: day + 'T00:00:00Z',
          today: day,
          allowed: () => true,
        },
      );
      assert.equal(control.documents.length, 1);
      values.routineFqcControl = JSON.stringify(control);
    });
    const old = Object.fromEntries(
      [coreFile, routeFile].map((file) => [
        file,
        execFileSync('git', ['show', predecessor + ':' + file], {
          encoding: 'utf8',
        }),
      ]),
    );
    let sample;
    const readers = {};
    for (const version of ['before', 'after']) {
      const { load } = loader(
        path.resolve(__dirname, '..'),
        f.env,
        {},
        version === 'before' ? old : {},
      );
      const core = load(coreFile);
      timed(load('lib/state-records.ts'), 'decodeRecordValues', (s, e) => {
        sample.decodeMs += e - s;
      });
      for (const key of [
        'identity',
        'can',
        'createRoutineEntryPermissionPhase',
      ]) {
        if (core[key])
          timed(core, key, (s, e) => {
            sample.initialAuthMs += e - s;
          });
      }
      if (core.createRoutineEntryPermissionPhase) {
        const create = core.createRoutineEntryPermissionPhase;
        core.createRoutineEntryPermissionPhase = async (...args) => {
          const original = await create(...args);
          if (!original) return null;
          const phase = {
            ...original,
            allowed(key) {
              const start = clock();
              try {
                return original.allowed(key);
              } finally {
                sample.initialAuthMs += clock() - start;
              }
            },
          };
          timed(phase, 'current', (s, e) => {
            sample.finalAuthMs += e - s;
          });
          return phase;
        };
      }
      readers[version] = load(routeFile);
    }
    timed(f.env.STATE_ARCHIVE, 'get', (s, e) =>
      sample.getIntervals.push([s, e]),
    );
    for (const [r2, sql] of [
      [0, 0],
      [50, 5],
      [5, 50],
    ]) {
      f.hooks.get = () => sleep(r2);
      f.hooks.sql = () => sleep(sql);
      for (const query of ['?availability=1', '']) {
        let expected;
        for (let pair = 1; pair <= 6; pair++) {
          for (const version of pair % 2
            ? ['before', 'after']
            : ['after', 'before']) {
            sample = {
              decodeMs: 0,
              initialAuthMs: 0,
              finalAuthMs: 0,
              getIntervals: [],
            };
            f.events.length = 0;
            const start = clock();
            const response = await readers[version].GET(
              new Request('https://synthetic.invalid/api/routine-fqc' + query, {
                headers: { cookie: f.cookies.editor },
              }),
            );
            const body = await response.text(),
              totalMs = clock() - start;
            assert.equal(response.status, 200);
            expected ??= body;
            assert.equal(body, expected);
            const queries = f.events
              .filter((e) => e.kind === 'read')
              .map((e) => e.sql);
            const sqlCount = { snapshot: 0, revocation: 0, revision: 0 };
            for (const statement of queries) {
              if (statement.includes('FROM process_revoked_sessions'))
                sqlCount.revocation++;
              else if (
                statement.startsWith('SELECT revision FROM shared_state')
              )
                sqlCount.revision++;
              else if (statement.includes('FROM shared_state'))
                sqlCount.snapshot++;
              else throw Error('Unclassified SQL read');
            }
            const r2WaitMs = union(sample.getIntervals);
            console.log(
              JSON.stringify({
                pair,
                version,
                query,
                r2,
                sql,
                totalMs,
                sqlCount,
                bytes: Buffer.byteLength(body),
                gets: sample.getIntervals.length,
                decodeMs: sample.decodeMs,
                r2WaitMs,
                decodeOutsideGetsMs: sample.decodeMs - r2WaitMs,
                initialAuthMs: sample.initialAuthMs,
                finalAuthMs: sample.finalAuthMs,
              }),
            );
          }
        }
      }
    }
  } finally {
    f.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
