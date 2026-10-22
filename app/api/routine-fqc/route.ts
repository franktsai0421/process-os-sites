import { env } from 'cloudflare:workers';
import {workflowAccess} from '@/lib/versioned-shared-workflow';
import {
  readState,
  identity,
  can,
  sameOrigin,
  encodeValues,
  backupStoredState,
  responseHeaders,
} from '@/lib/process-state';
import { DraftConflict } from '@/lib/shared-draft';
import {
  RF_KEY,
  parseRoutine,
  routineSources,
  routineCatalog,
  schedulePreview,
  nextDate,
  companyDate,
  executeRoutine,
  photoIds,
  docStatus,
  docContent,
  unresolvedFailureSamples,
  reportAvailability,
  cancellationDependencies,
  planFamily,
  reportIssues,
  type RoutineCommand,
} from '@/lib/routine-fqc';

async function access(
  request: Request,
  state: Awaited<ReturnType<typeof readState>>,
) {
  const granular=await workflowAccess(request,state);
  return {...granular,settings:granular.view&&await can(request,state,'routine.settings'),revoke:granular.approve&&await can(request,state,'approval.revoke'),revise:granular.edit&&await can(request,state,'approval.revise')};
}
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: responseHeaders });
const enabled = (
  request: Request,
  state: Awaited<ReturnType<typeof readState>>,
) =>
  (['localhost', '127.0.0.1'].includes(new URL(request.url).hostname) &&
    new URL(request.url).port === '3040') ||
  state.values.routineFqcEnabled === '1';
export async function GET(request: Request) {
  try {
    const state = await readState({
        deferHistory: true,
        deferDependencyHistory: true,
      }),
      actor = await identity(request, state),
      permissions = await access(request, state);
    if (!actor) return reply({ error: 'LOGIN_REQUIRED' }, 401);
    if (!permissions.view) return reply({ error: 'FORBIDDEN' }, 403);
    const c = parseRoutine(state.values[RF_KEY]),
      sources = routineSources(state),
      query = new URL(request.url).searchParams;
    if (query.has('availability'))
      return reply({ enabled: enabled(request, state) });
    if (!enabled(request, state))
      return reply({ error: 'FQC_NOT_ENABLED' }, 404);
    // Search is a read-only projection under routine.view. It does not grant
    // schedule settings access and never persists preview jobs.
    if (query.has('search-preview')) {
      const today = companyDate();
      const start = c.startDate || today;
      const jobs = sources.flatMap((source) => {
        const existing = c.jobs.filter((j) => j.itemId === source.id);
        const future = existing.filter((j) => j.start > today)
          .sort((a, b) => a.start.localeCompare(b.start))[0];
        if (future) return [{ ...future, previewExisting: true }];
        const due = schedulePreview(c, [source], start, today);
        const virtual = { ...c, jobs: [...c.jobs, ...due] };
        const last = virtual.jobs.filter((j) => j.itemId === source.id)
          .map((j) => j.end).sort().at(-1);
        const horizon = [start, source.effectiveDate || start,
          last ? nextDate(last) : nextDate(today)].sort().at(-1)!;
        return schedulePreview(virtual, [source], start, horizon)
          .filter((j) => j.end > today).slice(0, 1);
      });
      return reply({ jobs, revision: c.revision,
        unresolved: sources.filter((source) => !source.frequency) });
    }
    if (query.has('preview')) {
      if (!permissions.settings) return reply({ error: 'FORBIDDEN' }, 403);
      const start = query.get('start') || c.startDate || companyDate();
      const jobs = sources.flatMap((source) => {
        const last = c.jobs
          .filter((j) => j.itemId === source.id)
          .map((j) => j.end)
          .sort()
          .at(-1);
        const horizon = [start, companyDate(), last ? nextDate(last) : start]
          .sort()
          .at(-1)!;
        return schedulePreview(c, [source], start, horizon);
      });
      return reply({ jobs, unresolved: sources.filter((s) => !s.frequency) });
    }
    if (query.has('operationId')) {
      const receipt = c.receipts[query.get('operationId')!];
      if (!receipt || receipt.actorId !== actor.id)
        return reply({ error: 'OPERATION_NOT_FOUND' }, 404);
      return reply({ result: receipt.result, revision: c.revision });
    }
    const documents = c.documents.map((d) => ({
      ...d,
      familyId: planFamily(c, d),
      reportAvailability: d.kind === 'plan' ? reportAvailability(c, d) : [],
      dependencies: cancellationDependencies(c, d),
      workingIssues: reportIssues(d.flow.working, d.kind),
      savedIssues: d.flow.saved ? reportIssues(d.flow.saved.content, d.kind) : [],
      flow: {
        ...d.flow,
        receipts: {},
        sequences: {},
        saves: permissions.history ? d.flow.saves : [],
        cases: permissions.history
          ? d.flow.cases
          : d.flow.cases.filter(
              (k) => k.id === d.flow.pendingId || k.id === d.flow.active.id,
            ),
      },
    }));
    if (query.has('export')) {
      if (!permissions.history) return reply({ error: 'FORBIDDEN' }, 403);
      const d = documents.find((d) => d.id === query.get('export'));
      if (!d || docStatus(d) !== 'approved')
        return reply({ error: 'FORMAL_DOCUMENT_REQUIRED' }, 409);
      return reply({
        document: d,
        content: d.flow.active.content,
        cases: c.cases.filter((a) => a.reportIds.includes(d.id)),
        exportedAt: new Date().toISOString(),
        timezone: 'Asia/Ho_Chi_Minh',
      });
    }
    return reply({
      control: {
        ...c,
        documents,
        cases: c.cases.map((item) => ({
          ...item,
          unresolvedFailureSamples: unresolvedFailureSamples(c, item),
        })),
        receipts: {},
      },
      sources,
      catalog: routineCatalog(state),
      permissions,
      identity: actor,
      today: companyDate(),
      revision: state.revision,
    });
  } catch (error) {
    return reply(
      {
        error: error instanceof DraftConflict ? error.code : 'FQC_READ_FAILED',
      },
      error instanceof DraftConflict ? error.status : 503,
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: 'ORIGIN_FORBIDDEN' }, 403);
  const requestId = crypto.randomUUID();
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new DraftConflict('BODY_REQUIRED', 422);
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const b = await reader.read();
      if (b.done) break;
      length += b.value.length;
      if (length > 2_000_000) {
        await reader.cancel();
        return reply({ error: 'BODY_TOO_LARGE' }, 413);
      }
      chunks.push(b.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const raw = new TextDecoder().decode(bytes);
    if (/__immutableBody|__liveContent|__proto__/.test(raw))
      throw new DraftConflict('RESERVED_CONTENT', 422);
    const command = JSON.parse(raw) as RoutineCommand;
    for (let attempt = 0; attempt < 5; attempt++) {
      const state = await readState({
          deferHistory: true,
          deferDependencyHistory: true,
        }),
        actor = await identity(request, state);
      if (!actor) return reply({ error: 'LOGIN_REQUIRED' }, 401);
      if (state.values.maintenanceMode === '1')
        return reply({ error: 'MAINTENANCE' }, 503);
      const permissions = await access(request, state);
      if (!permissions.view) return reply({ error: 'FORBIDDEN' }, 403);
      if(['create-plan','create-report'].includes(command.action)&&!await can(request,state,'routine.create'))return reply({error:'FORBIDDEN'},403);
      if(['discard-draft','delete-plan'].includes(command.action)&&!await can(request,state,'routine.delete'))return reply({error:'FORBIDDEN'},403);
      const control = parseRoutine(state.values[RF_KEY]),
        existing = control.receipts[command.operationId];
      const at = new Date().toISOString();
      if (command.action === 'enable') {
        if (
          actor.role !== 'admin' ||
          !['127.0.0.1', 'localhost'].includes(new URL(request.url).hostname) ||
          new URL(request.url).port !== '3000'
        )
          return reply({ error: 'FORBIDDEN' }, 403);
        if (state.values.routineFqcEnabled === '1')
          return reply({ enabled: true });
        if (
          !(await backupStoredState(
            state,
            'routine-fqc enable after acceptance',
            actor.id,
          ))
        )
          continue;
        const changed = await env.DB.prepare(
          'UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?',
        )
          .bind(
            state.revision + 1,
            await encodeValues(
              { ...state.values, routineFqcEnabled: '1' },
              state,
            ),
            at,
            state.revision,
          )
          .run();
        if (changed.meta.changes !== 1) continue;
        return reply({ enabled: true });
      }
      if (!enabled(request, state))
        return reply({ error: 'FQC_NOT_ENABLED' }, 404);
      const result = executeRoutine(control, command, routineSources(state), {
        actor: {
          id: actor.id,
          name: actor.name,
          admin: actor.role === 'admin',
        },
        at,
        today: companyDate(),
        allowed: (p) => permissions[p],
        settings: permissions.settings,
        revoke: permissions.revoke,
        revise: permissions.revise,
      });
      if (existing)
        return reply({ result, revision: control.revision, replayed: true });
      const doc = control.documents.find((d) => d.id === command.documentId);
      const photos = new Set([
        ...(doc
          ? [...photoIds(doc.flow.working), ...photoIds(docContent(doc))]
          : []),
        ...(command.photos || []),
      ]);
      for (const id of photos)
        if (
          !/^[a-f0-9]{64}$/.test(id) ||
          !(await env.STATE_ARCHIVE.head('routine-fqc/photos/' + id))
        )
          {
            const line = doc?.flow.working.lines.find((l) => l.results.some((r) => r.photos.includes(id))),
              row = line?.results.find((r) => r.photos.includes(id));
            throw new DraftConflict('PHOTO_NOT_UPLOADED', 422, { issues: [{ kind: 'error', message: 'PHOTO_NOT_UPLOADED', path: line && row ? ['lines', { id: line.id }, 'results', { id: row.id }, 'photos'] : ['evidence'] }] });
          }
      if (
        !(await backupStoredState(
          state,
          'routine-fqc ' + command.action,
          actor.id,
        ))
      )
        continue;
      const values = { ...state.values, [RF_KEY]: JSON.stringify(control) };
      const changed = await env.DB.prepare(
        'UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?',
      )
        .bind(
          state.revision + 1,
          await encodeValues(values, state),
          at,
          state.revision,
        )
        .run();
      if (changed.meta.changes !== 1) continue;
      return reply({ result, revision: control.revision, requestId });
    }
    return reply({ error: 'CONCURRENT_CHANGE_RETRY', requestId }, 409);
  } catch (error) {
    if (error instanceof DraftConflict)
      return reply(
        { error: error.code, details: error.details, requestId },
        error.status,
      );
    if (error instanceof SyntaxError)
      return reply({ error: 'INVALID_JSON', requestId }, 422);
    console.error(
      '[routine-fqc]',
      requestId,
      error instanceof Error ? error.name : 'unknown',
    );
    return reply({ error: 'FQC_WRITE_FAILED', requestId }, 500);
  }
}
