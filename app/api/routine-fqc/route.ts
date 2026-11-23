import {checkPlanIntent} from '@/lib/routine-plan-intent';
import { isRoutineScheduleOwner } from '@/lib/routine-schedule-owner';
import {routineApprovedQuery,routineApprovedControl,routineApprovedRows,routineApprovedVersion} from '@/lib/routine-fqc-approved-history';
import { prepareRoutineFqcStart, routineFqcStartMaster } from '@/lib/state-records';
import {recordJSONResponse} from '@/lib/state-records-response';
import { env } from 'cloudflare:workers';
import {workflowAccess} from '@/lib/versioned-shared-workflow';
import {
  readState,
  identity,
  can,
  createRoutineEntryPermissionPhase,
  routineStartupPermissionPhase,
  sameOrigin,
  encodeValues,
  stateRevisionIsCurrent,
  responseHeaders,
} from '@/lib/process-state';
import { DraftConflict } from '@/lib/shared-draft';
import { generateCalendar, reconcileCalendar, validCalendarDate } from '@/lib/routine-fqc-calendar';
import {
  RF_KEY,
  emptyRoutine,
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
  routineCaseOutcome,
  routineDocumentReviewIssues,
  reportIssues,
  routineSourceTimeline,
  type RoutineCommand,
} from '@/lib/routine-fqc';

async function access(
  request: Request,
  state: Awaited<ReturnType<typeof readState>>,
  check = (key: string): boolean | Promise<boolean> => can(request, state, key),
) {
  const granular=await workflowAccess(request,state,check);
  return {...granular,settings:granular.view&&await check('routine.settings'),revoke:granular.approve&&await check('approval.revoke'),revise:granular.edit&&await check('approval.revise')};
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
    const approved=routineApprovedQuery(request);
    const authorityKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','routineFqcEnabled'];
    const query = new URL(request.url).searchParams, operationId=query.get('operationId');
    if(operationId?.startsWith('~plan-intent~'))return reply({error:'INVALID_SELECTOR'},422);
    const calendarPreview = query.get('preview') === '1' && query.get('calendar') === '2';
    if (calendarPreview && (query.size !== 3 || !query.has('start')))
      return reply({error:'DATE_INVALID'},422);
    // The normal page and its availability probe share authority and layout.
    // Only the full page consumes the approved FQC and master catalogs.
    const availability = query.size === 1 && query.get('availability') === '1';
    const entryKeys = [...authorityKeys, RF_KEY];
    const pendingOnly = query.size === 1 && query.get('pending-count') === '1';
    // Both consumers of this dependency use only the active, approved FQC
    // version. Keep its metadata and complete snapshot, including image refs.
    const entryCatalog = (key: string, raw: string) => {
      if (key !== 'qualityMasterControl') return raw;
      const library = JSON.parse(raw)?.libraries?.fqc;
      if (!Array.isArray(library?.versions)) return raw;
      const version = library.versions.find((row: {id: string; status: string}) =>
        row.id === library.activeVersionId && row.status === 'approved');
      return JSON.stringify({libraries: {fqc: {activeVersionId: library.activeVersionId, versions: version ? [version] : []}}});
    };
    const state = await readState({
        ...(availability ? {keys: entryKeys, aggregateReadAhead: true}
          : query.size === 0 ? {keys: [...entryKeys, 'qualityMasterControl', 'masterDataControl'], aggregateReadAhead: true, projectValue: entryCatalog} : {}),
        ...(pendingOnly ? {keys: entryKeys, aggregateReadAhead: true} : {}),
        ...(approved?{keys:[...authorityKeys,RF_KEY],modelKey:RF_KEY}:{}),
        ...(calendarPreview ? {keys:[...entryKeys,'qualityMasterControl','masterDataControl'],aggregateReadAhead:true,
          projectValue:(key:string,raw:string)=>{
            if(key==='masterDataControl')return routineFqcStartMaster(raw);
            if(key!=='qualityMasterControl')return raw;
            const fqc=JSON.parse(raw)?.libraries?.fqc;
            if(!Array.isArray(fqc?.versions))return raw;
            return JSON.stringify({libraries:{fqc:{activeVersionId:fqc.activeVersionId,
              versions:fqc.versions.filter((v:{status:string})=>v.status==='approved'||v.status==='superseded')}}});
          }} : {}),
        deferHistory: !calendarPreview,
        deferDependencyHistory: !calendarPreview,
        ...(operationId?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','routineFqcEnabled',RF_KEY],projectValue:(key:string,raw:string)=>{if(key!==RF_KEY)return raw;const root=JSON.parse(raw);return JSON.stringify({schemaVersion:root.schemaVersion,revision:root.revision,documents:[],jobs:[],cases:[],receipts:root.receipts&&Object.hasOwn(root.receipts,operationId)?{[operationId]:root.receipts[operationId]}:{}});}}:{}),
      }),
      entryPhase = availability || query.size === 0
        ? await createRoutineEntryPermissionPhase(request, state)
        : (calendarPreview || operationId && query.size===1) ? await routineStartupPermissionPhase(request,state) : null,
      actor = entryPhase ? entryPhase.actor : await identity(request, state);
    if (!actor) return reply({ error: 'LOGIN_REQUIRED' }, 401);
    const permissions = await access(request, state, entryPhase?.allowed);
    // The response is serialized before these independent revision/session reads.
    // The phase is never shared with another request, a history read or a write.
    const finishEntry = async (response: Response) => {
      if (entryPhase) {
        if (!await stateRevisionIsCurrent(state)) return reply({error:'CONCURRENT_CHANGE_RETRY'},409);
        if (!await entryPhase.current()) return reply({error:'LOGIN_REQUIRED'},401);
      }
      return response;
    };
    if (!permissions.view) return reply({ error: 'FORBIDDEN' }, 403);
    if(approved){
      if(!enabled(request,state))return reply({error:'FQC_NOT_ENABLED'},404);
      const expected=request.headers.get('X-Process-Expected-Actor');if(!permissions.history||expected&&expected!==actor.id)return reply({error:'FORBIDDEN'},403);
      const c=routineApprovedControl(state.recordStorage?.models.get(RF_KEY)||parseRoutine(state.values[RF_KEY])),d=c.documents.find(d=>d.id===approved.documentId);
      if(!d)return reply({error:'DOCUMENT_NOT_FOUND'},404);
      const accessPermissions={...permissions,delete:false};
      let payload:unknown={approvedOnly:true,revision:state.revision,permissions:accessPermissions,documentId:d.id,actorId:actor.id,activeVersionId:d.flow.active.id};
      if(approved.kind==='list'){const rows=routineApprovedRows(d),start=approved.before?rows.findIndex(v=>v.id===approved.before)+1:0;if(approved.before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);payload={...payload as object,versions:{rows:rows.slice(start,start+20),next:rows.length>start+20?rows[start+19].id:null,total:rows.length}};}
      if(approved.kind==='detail'){const version=routineApprovedVersion(d,approved.versionId!);if(!version)return reply({error:'VERSION_NOT_FOUND'},404);payload={...payload as object,version};}
      // Buffer exactly one selected body before the final role/revision/session fence.
      const rendered=state.recordStorage?recordJSONResponse(payload,env.STATE_ARCHIVE,responseHeaders):reply(payload),text=await rendered.text();
      const fresh=await readState({keys:authorityKeys}),freshActor=await identity(request,fresh),freshPermissions=await access(request,fresh);
      if(!freshActor||freshActor.id!==actor.id||freshActor.sessionType!==actor.sessionType||!freshPermissions.view||!freshPermissions.history||!enabled(request,fresh))return reply({error:'FORBIDDEN'},403);
      if(fresh.revision!==state.revision||!await stateRevisionIsCurrent(fresh))return reply({error:'APPROVED_HISTORY_SUPERSEDED'},409);
      const finalActor=await identity(request,fresh);if(!finalActor||finalActor.id!==actor.id||finalActor.sessionType!==actor.sessionType)return reply({error:'FORBIDDEN'},403);
      return new Response(text,{headers:responseHeaders});
    }
    const c = parseRoutine(state.values[RF_KEY]);
    if (query.has('availability')) {
      // Only the exact approval-badge probe needs the IQC capability. IQC
      // shares the stored feature flag, but does not use FQC's local QA override.
      const badgeProbe = availability && request.headers.get('X-Process-Routine-Pending') === '1';
      const iqcEnabled = badgeProbe && state.values.routineFqcEnabled === '1' &&
        await (entryPhase?.allowed('iqc.view') ?? can(request, state, 'iqc.view'));
      return await finishEntry(reply({ enabled: enabled(request, state),
        ...(badgeProbe ? { iqcEnabled } : {}),
        ...((c as typeof c & {pageDraftLayout?:string}).pageDraftLayout==='page-v1'?{pageDraftLayout:'page-v1'}:{}) }));
    }
    if (!enabled(request, state))
      return reply({ error: 'FQC_NOT_ENABLED' }, 404);
    if ((c as typeof c & {pageDraftLayout?:string}).pageDraftLayout === 'page-v1' && !query.has('operationId') && !query.has('export') && !query.has('legacyArchive'))
      return await finishEntry(reply({enabled:true,pageDraftLayout:'page-v1',pageEndpoint:'/api/routine-fqc/page'}));
    if (pendingOnly) {
      if (!await stateRevisionIsCurrent(state)) return reply({error:'CONCURRENT_CHANGE_RETRY'},409);
      if ((await identity(request,state))?.id !== actor.id) return reply({error:'LOGIN_REQUIRED'},401);
      return reply({enabled:true,pendingCount:c.documents.filter(d=>!d.cancelled&&d.flow.pendingId).length,revision:state.revision});
    }
    const sources = operationId?[]:routineSources(state);
    if(query.has('legacyArchive')&&([...query.keys()].some(key=>!['legacyArchive','compact'].includes(key))||query.getAll('legacyArchive').length!==1||query.get('legacyArchive')!=='1'))return reply({error:'ROUTINE_PAGE_SELECTOR_INVALID'},422);
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
      if (!isRoutineScheduleOwner(actor) || !permissions.settings) return reply({ error: 'FORBIDDEN' }, 403);
      if (calendarPreview) {
        if (!permissions.edit) return reply({error:'FORBIDDEN'},403);
        if (c.startDate || c.calendarPolicy || c.jobs.length || c.documents.length || c.cases.length)
          return reply({error:'START_DATE_LOCKED'},409);
        const start = query.get('start');
        if (!validCalendarDate(start)) return reply({error:'DATE_INVALID'},422);
        const now = new Date(), today = companyDate(now), horizon = start > today ? start : today;
        const projection = emptyRoutine();
        projection.startDate = start;
        projection.calendarPolicy = {version:2,adoptedAt:new Date(start+'T00:00:00+07:00').toISOString(),scopes:{}};
        reconcileCalendar(projection,routineSourceTimeline(state),horizon,now.toISOString());
        generateCalendar(projection,sources,horizon,now.toISOString());
        const response = reply({jobs:projection.jobs.filter(job=>!job.calendar?.stopped),unresolved:sources.filter(source=>!source.frequency)});
        if (!await stateRevisionIsCurrent(state)) return reply({error:'CONCURRENT_CHANGE_RETRY'},409);
        const current = await identity(request,state);
        if (!current || current.id !== actor.id || current.sessionType !== actor.sessionType)
          return reply({error:'LOGIN_REQUIRED'},401);
        return response;
      }
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
      const response=receipt && receipt.actorId === actor.id
        ? reply({ result: receipt.result, revision: c.revision })
        : reply({ error: 'OPERATION_NOT_FOUND' },404);
      if(!(entryPhase ? await entryPhase.current() : (await identity(request,state))?.id===actor.id))return reply({error:'LOGIN_REQUIRED'},401);
      if(!await stateRevisionIsCurrent(state))return reply({error:'CONCURRENT_CHANGE_RETRY'},409);
      return response;
    }
    const documents = c.documents.map((d) => ({
      ...d,
      familyId: planFamily(c, d),
      reportAvailability: d.kind === 'plan' ? reportAvailability(c, d) : [],
      dependencies: cancellationDependencies(c, d),
      workingIssues: c.calendarPolicy ? routineDocumentReviewIssues(c, d, d.flow.working) : reportIssues(d.flow.working, d.kind),
      savedIssues: d.flow.saved ? (c.calendarPolicy ? routineDocumentReviewIssues(c, d, d.flow.saved.content) : reportIssues(d.flow.saved.content, d.kind)) : [],
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
    if(query.has('legacyArchive')){
      if(query.getAll('legacyArchive').length!==1||query.get('legacyArchive')!=='1'||!permissions.history)return reply({error:'FORBIDDEN'},403);
      const approved=documents.filter(doc=>doc.flow.active.id||doc.flow.cases.some(review=>review.status==='approved')).map(doc=>{const cases=doc.flow.cases.filter(review=>review.status==='approved'),savedIds=new Set(cases.map(review=>review.savedId));return{id:doc.id,number:doc.number,kind:doc.kind,planId:doc.planId,caseId:doc.caseId,correctionOf:doc.correctionOf,source:{scope:doc.flow.scope,active:doc.flow.active,cases,saves:doc.flow.saves.filter(save=>savedIds.has(save.id))}};});
      const expected=request.headers.get('X-Process-Expected-Actor');if(expected&&expected!==actor.id)return reply({error:'FORBIDDEN'},403);
      const payload={kind:'routine-legacy-document-archive-v1',documents:approved,permissions:{view:permissions.view,history:true,edit:false,save:false,submit:false,withdraw:false,approve:false,return:false},identity:actor,revision:state.revision};
      // Complete archive hydration before final authority checks; no stream
      // prefix may escape after a late revocation or revision/role change.
      const rendered=state.recordStorage?recordJSONResponse(payload,env.STATE_ARCHIVE,responseHeaders):reply(payload),text=await rendered.text();
      const fresh=await readState({keys:authorityKeys}),freshActor=await identity(request,fresh),freshPermissions=await access(request,fresh);
      if(!freshActor||freshActor.id!==actor.id||freshActor.sessionType!==actor.sessionType||!freshPermissions.view||!freshPermissions.history||!enabled(request,fresh))return reply({error:'FORBIDDEN'},403);
      if(fresh.revision!==state.revision||!await stateRevisionIsCurrent(fresh))return reply({error:'APPROVED_HISTORY_SUPERSEDED'},409);
      const finalActor=await identity(request,fresh);if(!finalActor||finalActor.id!==actor.id||finalActor.sessionType!==actor.sessionType)return reply({error:'FORBIDDEN'},403);
      return new Response(text,{headers:responseHeaders});
    }
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
    return await finishEntry(reply({
      control: {
        ...c,
        documents,
        cases: c.cases.map((item) => ({
          ...item,
          unresolvedFailureSamples: unresolvedFailureSamples(c, item),
          ...(c.calendarPolicy ? {workflowOutcome: routineCaseOutcome(c, item)} : {}),
        })),
        receipts: {},
        resetLedger: undefined,
      },
      sources,
      catalog: routineCatalog(state),
      permissions: {...permissions, settings: permissions.settings && isRoutineScheduleOwner(actor)},
      identity: actor,
      today: companyDate(),
      revision: state.revision,
    }));
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
    // These calendar document transitions consume the same approved timeline as
    // generation. Unknown and legacy storage layouts keep the full reader.
    const calendarDocument = ['create-plan','create-report','request','draft'].includes(command.action);
    const scheduleAction = new URL(request.url).search ? null :
      command.action === 'configure' ? 'configure' :
      command.action === 'generate' || calendarDocument ? 'generate' : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = scheduleAction ? await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1')
        .first<{revision:number;values:string}>() : null;
      const selected = row && scheduleAction ? await prepareRoutineFqcStart(env.STATE_ARCHIVE,row.values,scheduleAction) : null;
      const schedulePhase = scheduleAction === 'configure' || selected !== null;
      const state = selected && row ? {revision:row.revision,values:selected.values} : await readState({
          deferHistory: true,
          deferDependencyHistory: true,
        }),
        phase = schedulePhase ? await routineStartupPermissionPhase(request,state) : null,
        actor = phase ? phase.actor : await identity(request, state);
      if (!actor) return reply({ error: 'LOGIN_REQUIRED' }, 401);
      if (state.values.maintenanceMode === '1')
        return reply({ error: 'MAINTENANCE' }, 503);
      const permissions = await access(request, state, phase?.allowed);
      if (!permissions.view) return reply({ error: 'FORBIDDEN', requestId }, 403);
      if (command.action === 'configure' && !isRoutineScheduleOwner(actor))
        return reply({ error: 'FORBIDDEN', requestId }, 403);
      if(['create-plan','create-report','request'].includes(command.action)&&!await can(request,state,'routine.create'))return reply({error:'FORBIDDEN',requestId},403);
      if(['discard-draft','delete-plan'].includes(command.action)&&!await can(request,state,'routine.delete'))return reply({error:'FORBIDDEN',requestId},403);
      const control = parseRoutine(state.values[RF_KEY]),
        existing = control.receipts[command.operationId];
      if ((control as typeof control & {pageDraftLayout?:string}).pageDraftLayout === 'page-v1' && !existing)
        return reply({error:'ROUTINE_LEGACY_WRITER_RETIRED',requestId},409);
      await checkPlanIntent(control,'fqc',command,actor,state.values);
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
          !(await stateRevisionIsCurrent(state))
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
      // Calendar writes need the approved transition snapshots. Keep the
      // ordinary GET path on its bounded, active-version-only projection.
      let sourceState = state;
      if (!existing && control.calendarPolicy && !(selected && scheduleAction === 'generate')) {
        const source = await readState({keys:['qualityMasterControl','masterDataControl'],deferHistory:false});
        if (source.revision !== state.revision) continue;
        sourceState = {...state,values:{...state.values,...source.values}};
      }
      const result = executeRoutine(control, command, routineSources(sourceState), {
        actor: {
          id: actor.id,
          name: actor.name,
          admin: actor.role === 'admin',
        },
        at,
        today: companyDate(),
        sourceTimeline:!existing&&control.calendarPolicy?routineSourceTimeline(sourceState):undefined,
        allowed: (p) => permissions[p],
        settings: permissions.settings,
        revoke: permissions.revoke,
        revise: permissions.revise,
      });
      if (existing) {
        if (phase && !await stateRevisionIsCurrent(state)) return reply({error:'CONCURRENT_CHANGE_RETRY',requestId},409);
        if (phase && !await phase.current()) return reply({error:'LOGIN_REQUIRED',requestId},401);
        return reply({ result, revision: control.revision, replayed: true });
      }
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
        !(await stateRevisionIsCurrent(state))
      )
        continue;
      const values = { ...state.values, [RF_KEY]: JSON.stringify(control) };
      const encoded = schedulePhase ? (selected ? await selected.encode(values[RF_KEY]) : await encodeValues(values,state)) : undefined;
      const currentActor = phase ? null : await identity(request,state);
      const current = phase ? await phase.current() : currentActor?.id === actor.id && currentActor.sessionType === actor.sessionType;
      if (!current) return reply({error:'LOGIN_REQUIRED',requestId},401);
      const changed = await env.DB.prepare(
        'UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?',
      )
        .bind(
          state.revision + 1,
          encoded ?? await encodeValues(values, state),
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
