const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { sourceEvidence, verifySourceReview, githubCliReader, ownerAttestationEvidence, verifyOwnerAttestation } = require('../scripts/routine-source-review.cjs');

const repo = 'owner/project';
const file = 'app/api/routine-fqc/route.ts';
const user = (id, login) => ({ id, login, type: 'User' });
const owner = user(11, 'owner');
const author = user(22, 'contributor');

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-source-review-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgSign=false', '-c', 'core.autocrlf=false', ...args], { cwd }).toString().trim();
  const save = () => {
    git('add', '.');
    git('commit', '-qm', 'Synthetic source');
    return git('rev-parse', 'HEAD');
  };
  const update = contents => fs.writeFileSync(path.join(cwd, file), contents);
  git('init', '-q');
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  update('before\n');
  const base = save();
  update('after\r\n');
  const head = save();
  return { cwd, git, save, update, base, head, evidence: sourceEvidence(repo, 7, base, head, cwd) };
}

function github(evidence) {
  const pull = { number: 7, state: 'open', user: author, commits: 1,
    base: { ref: 'main', sha: evidence.base, repo: { full_name: repo, owner } },
    head: { sha: evidence.head } };
  const approval = { id: 100, user: owner, state: 'APPROVED', author_association: 'OWNER',
    body: 'Reviewed the raw source delta.\n\n' + evidence.challenge, commit_id: evidence.head,
    submitted_at: '2026-01-02T03:04:05Z' };
  const commits = [{ sha: evidence.head, author, committer: author,
    commit: { message: 'Synthetic source', verification: { verified: true, reason: 'valid' } } }];
  const read = (suffix, reviews = [approval]) => {
    if (!suffix) return Promise.resolve(pull);
    if (suffix === '/commits?per_page=100&page=1') return Promise.resolve(commits);
    if (suffix === '/reviews?per_page=100&page=1') return Promise.resolve(reviews);
    throw new Error('Unexpected synthetic endpoint: ' + suffix);
  };
  return { pull, approval, commits, read };
}

void test('evidence uses the exact committed bytes and rejects ambiguous scope', t => {
  const f = fixture(t);
  assert.equal(f.evidence.files.length, 1);
  const row = f.evidence.files[0];
  assert.equal(row.path, file);
  assert.equal(row.before.sha256, createHash('sha256').update('before\n').digest('hex'));
  assert.equal(row.after.sha256, createHash('sha256').update('after\r\n').digest('hex'));
  assert.equal(row.after.blob, f.git('rev-parse', f.head + ':' + file));
  f.update('after\n');
  assert.deepEqual(sourceEvidence(repo, 7, f.base, f.head, f.cwd), f.evidence);
  assert.notEqual(sourceEvidence(repo, 7, f.base, f.save(), f.cwd).challenge, f.evidence.challenge);
  assert.notEqual(sourceEvidence('someone/else', 7, f.base, f.head, f.cwd).challenge, f.evidence.challenge);
  assert.throws(() => sourceEvidence(repo, 7, f.base, 'HEAD', f.cwd), /full lowercase/);
  assert.throws(() => sourceEvidence(repo, 7, f.head, f.base, f.cwd));
  assert.throws(() => sourceEvidence(repo, 7, f.base, f.base, f.cwd), /No changed/);
  f.git('update-index', '--chmod=+x', file);
  f.git('commit', '-qm', 'Change mode');
  assert.throws(() => sourceEvidence(repo, 7, f.base, f.git('rev-parse', 'HEAD'), f.cwd), /non-executable/);
});

void test('approval is observed only from the independent owner at the exact GitHub head and digest', async t => {
  const { evidence } = fixture(t);
  const service = github(evidence);
  assert.deepEqual(await verifySourceReview(evidence, service.read), {
    state: 'github-review-observed', review: 100, reviewer: 'owner', ...evidence,
  });
  const commented = { ...service.approval, id: 101, state: 'COMMENTED', body: 'Follow-up note' };
  assert.equal((await verifySourceReview(evidence, suffix =>
    service.read(suffix, [service.approval, commented]))).review, 100);
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ ...commented, id: index + 1001 }));
  const paginated = suffix => {
    if (suffix === '/reviews?per_page=100&page=2') return Promise.resolve([service.approval]);
    return service.read(suffix, firstPage);
  };
  assert.equal((await verifySourceReview(evidence, paginated)).review, 100);
});

void test('rejects author, collaborator, bot, copied text, stale or withdrawn approval and API loss', async t => {
  const { evidence, base } = fixture(t);
  const { approval, read } = github(evidence);
  const denied = [
    [[], /No current independent/],
    [[{ ...approval, user: author }], /No current independent/],
    [[{ ...approval, user: { ...owner, type: 'Bot' } }], /identity changed/],
    [[{ ...approval, author_association: 'COLLABORATOR' }], /identity changed/],
    [[{ ...approval, state: 'COMMENTED' }], /No current independent/],
    [[{ ...approval, commit_id: base }], /No current independent/],
    [[{ ...approval, body: 'Approved' }], /exact review digest/],
    [[{ ...approval, body: evidence.challenge + '\n' + evidence.challenge }], /exact review digest/],
    [[approval, { ...approval, id: 101, state: 'CHANGES_REQUESTED' }], /No current independent/],
    [[approval, { ...approval, id: 101, state: 'DISMISSED' }], /No current independent/],
  ];
  for (const [reviews, expected] of denied) {
    await assert.rejects(verifySourceReview(evidence, suffix => read(suffix, reviews)), expected);
  }
  await assert.rejects(verifySourceReview(evidence, () => Promise.reject(Error('Network unavailable'))), /Network unavailable/);
});

void test('rejects self-review, contributor identity drift, changed PR snapshot and a dismissal during verification', async t => {
  const { evidence, base } = fixture(t);
  const { pull, approval, commits, read } = github(evidence);
  const withPull = changes => suffix => suffix ? read(suffix) : Promise.resolve({ ...pull, ...changes });
  await assert.rejects(verifySourceReview(evidence, withPull({ user: { ...owner, login: 'previous-name' } })), /own pull request/);
  await assert.rejects(verifySourceReview(evidence, withPull({ state: 'closed' })), /live pull request/);
  await assert.rejects(verifySourceReview(evidence, withPull({ head: { sha: base } })), /live pull request/);
  await assert.rejects(verifySourceReview(evidence, withPull({ base: { ...pull.base, sha: evidence.head } })), /live pull request/);
  for (const row of [
    { ...commits[0], author: owner },
    { ...commits[0], committer: owner },
    { ...commits[0], author: null },
    { ...commits[0], commit: { ...commits[0].commit, verification: { verified: false } } },
  ]) {
    const commitRead = suffix => suffix.startsWith('/commits') ? Promise.resolve([row]) : read(suffix);
    await assert.rejects(verifySourceReview(evidence, commitRead), /verified signed commit/);
  }
  let reads = 0;
  await assert.rejects(verifySourceReview(evidence, suffix =>
    read(suffix, suffix.startsWith('/reviews') && ++reads === 2 ? [{ ...approval, state: 'DISMISSED' }] : [approval])),
  /No current independent/);
});

void test('authenticated review transport uses only GET on GitHub and fails closed on CLI errors', () => {
  const evidence = { repo, number: 7 };
  const read = githubCliReader(evidence, (command, args, options) => {
    assert.equal(command, 'gh');
    assert.deepEqual(args, ['api', '--hostname', 'github.com', '--method', 'GET',
      '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28',
      'repos/owner/project/pulls/7/reviews?per_page=100&page=1']);
    assert.equal(options.env.GH_PROMPT_DISABLED, '1');
    assert.equal(options.timeout, 10_000);
    return Buffer.from('[]');
  });
  assert.deepEqual(read('/reviews?per_page=100&page=1'), []);
  for (const exec of [() => { throw Error('synthetic private diagnostics'); }, () => 'invalid JSON']) {
    assert.throws(() => githubCliReader(evidence, exec)(''),
      /^Error: GitHub CLI review lookup failed\. Use an existing account with read access to the repository\.$/);
  }
});

void test('a new committed revision invalidates the previous approval until the new digest is approved', async t => {
  const f = fixture(t);
  const previous = github(f.evidence);
  await verifySourceReview(f.evidence, previous.read);
  f.update('after a second push\n');
  const next = sourceEvidence(repo, 7, f.base, f.save(), f.cwd);
  const current = github(next);
  current.pull.commits = 2;
  current.commits.unshift(previous.commits[0]);
  const readWith = reviews => suffix => current.read(suffix, reviews);
  await assert.rejects(verifySourceReview(f.evidence, readWith([previous.approval])), /live pull request/);
  await assert.rejects(verifySourceReview(next, readWith([previous.approval])), /No current independent/);
  const copied = { ...current.approval, body: previous.approval.body };
  await assert.rejects(verifySourceReview(next, readWith([copied])), /exact review digest/);
  const approved = { ...current.approval, id: 101 };
  assert.deepEqual(await verifySourceReview(next, readWith([previous.approval, approved])), {
    state: 'github-review-observed', review: 101, reviewer: 'owner', ...next,
  });
});

function soloFixture(evidence, revisionEvent = null) {
  const repository = { full_name: repo, id: 72, private: true, node_id: 'repo-node',
    owner: { ...owner, node_id: 'owner-node' } };
  const pull = { ...github(evidence).pull, node_id: 'pr-node', user: repository.owner,
    base: { ref: 'main', sha: evidence.base, repo: repository },
    head: { sha: evidence.head, repo: { id: repository.id } } };
  const metadata = { repository: { id: repository.node_id, pullRequest: {
    id: pull.node_id, state: 'OPEN', baseRefOid: evidence.base, headRefOid: evidence.head,
    timelineItems: { nodes: revisionEvent === null ? [] : [{ id: revisionEvent }] },
  } } };
  const statement = ownerAttestationEvidence(evidence, pull, metadata).statement;
  const comment = { id: 330, node_id: 'comment-node', body: statement, user: repository.owner,
    author_association: 'OWNER', performed_via_github_app: null,
    created_at: '2026-01-02T03:04:05Z', updated_at: '2026-01-02T03:04:05Z' };
  metadata.attestation = { id: comment.node_id, body: statement, authorAssociation: 'OWNER',
    author: { __typename: 'User', id: 'owner-node', login: 'owner' }, pullRequest: { id: pull.node_id },
    editor: null, lastEditedAt: null, includesCreatedEdit: false, createdViaEmail: false, isMinimized: false };
  const read = Object.assign(suffix => {
    assert.equal(suffix, '');
    return pull;
  }, {
    comment(id) { assert.equal(id, comment.id); return comment; },
    ownerSnapshot(node) { assert.equal(node, comment.node_id); return metadata; },
  });
  return { pull, metadata, comment, read, statement };
}

void test('solo evidence is distinct from approval and binds the exact private owner PR', async t => {
  const { evidence } = fixture(t);
  const f = soloFixture(evidence);
  assert.notEqual(f.statement, evidence.challenge);
  const result = await verifyOwnerAttestation(evidence, f.comment.id, f.read);
  assert.equal(result.state, 'github-owner-attestation-observed');
  assert.equal(result.repositoryId, 72);
  assert.equal(result.pullId, 'pr-node');
  assert.equal(result.commentId, 330);
  assert.equal(result.statement, f.statement);
  await assert.rejects(verifySourceReview(evidence, f.read), /own pull request/);
  await assert.rejects(verifyOwnerAttestation(evidence, 0, f.read), /numeric/);
  for (const change of [
    pull => { pull.base.repo.private = false; },
    pull => { pull.user = author; },
    pull => { pull.head.repo.id = 73; },
    pull => { pull.base.repo.owner.type = 'Organization'; },
  ]) {
    const rejected = soloFixture(evidence);
    change(rejected.pull);
    await assert.rejects(verifyOwnerAttestation(evidence, rejected.comment.id, rejected.read), /same private personal repository/);
  }
});

void test('solo verification refuses copied statements, bots, apps, edits, hidden comments and wrong threads', async t => {
  const { evidence } = fixture(t);
  const tampering = [
    [f => { f.comment.user = author; }, /repository owner/],
    [f => { f.comment.user = { ...f.comment.user, type: 'Bot' }; }, /repository owner/],
    [f => { f.comment.author_association = 'COLLABORATOR'; }, /repository owner/],
    [f => { f.comment.performed_via_github_app = { id: 9 }; }, /app attribution/],
    [f => { delete f.comment.performed_via_github_app; }, /app attribution/],
    [f => { f.comment.updated_at = '2026-01-02T04:00:00Z'; }, /original GitHub comment/],
    [f => { f.metadata.attestation.editor = author; }, /unedited/],
    [f => { f.metadata.attestation.lastEditedAt = f.comment.created_at; }, /unedited/],
    [f => { f.metadata.attestation.includesCreatedEdit = true; }, /unedited/],
    [f => { f.metadata.attestation.createdViaEmail = true; }, /unedited/],
    [f => { f.metadata.attestation.isMinimized = true; }, /unedited/],
    [f => { f.metadata.attestation.author.id = 'different-owner-node'; }, /repository owner/],
    [f => { f.metadata.attestation.pullRequest.id = 'other-pr'; }, /this pull request/],
    [f => { f.comment.body = 'Quoted:\n' + f.statement; }, /does not match/],
    [f => { f.comment.body = evidence.challenge; }, /does not match/],
    [f => { f.metadata.attestation.body = ''; }, /does not match/],
    [f => { f.metadata.repository.id = 'other-repo'; }, /revision history/],
    [f => { delete f.metadata.repository.pullRequest.timelineItems; }, /revision history/],
  ];
  for (const [change, expected] of tampering) {
    const f = soloFixture(evidence);
    change(f);
    await assert.rejects(verifyOwnerAttestation(evidence, f.comment.id, f.read), expected);
  }
});

void test('solo attestation is invalidated by new commits and force-return to the same Git head', async t => {
  const f = fixture(t);
  const previous = soloFixture(f.evidence);
  await verifyOwnerAttestation(f.evidence, previous.comment.id, previous.read);
  f.update('different bytes in the new head\n');
  const changed = sourceEvidence(repo, 7, f.base, f.save(), f.cwd);
  const next = soloFixture(changed);
  next.comment.body = next.metadata.attestation.body = previous.statement;
  await assert.rejects(verifyOwnerAttestation(changed, next.comment.id, next.read), /current source revision/);
  const returned = soloFixture(f.evidence, 'force-push-event');
  returned.comment.body = returned.metadata.attestation.body = previous.statement;
  await assert.rejects(verifyOwnerAttestation(f.evidence, returned.comment.id, returned.read), /current source revision/);

  const race = soloFixture(f.evidence);
  const readComment = race.read.comment.bind(race.read);
  let count = 0;
  race.read.comment = id => ++count === 1 ? readComment(id) : null;
  await assert.rejects(verifyOwnerAttestation(f.evidence, race.comment.id, race.read), /original GitHub comment/);
});

void test('solo transport only requests a comment and a static GraphQL query through GitHub CLI', () => {
  const requests = [];
  const read = githubCliReader({ repo, number: 7 }, (command, args, options) => {
    assert.equal(command, 'gh');
    assert.deepEqual(args.slice(0, 4), ['api', '--hostname', 'github.com', '--method']);
    assert.equal(options.stdio[2], 'ignore');
    requests.push([args[4], args.at(-1)]);
    if (args[4] === 'GET') {
      assert.equal(options.input, undefined);
      return '{}';
    }
    const { query, variables } = JSON.parse(options.input);
    assert.match(query, /^query RoutineOwnerSnapshot/);
    assert.match(query, /HEAD_REF_FORCE_PUSHED_EVENT/);
    assert.doesNotMatch(query, /\bmutation\b/);
    assert.deepEqual(variables, { owner: 'owner', name: 'project', number: 7, comment: 'comment-node', readComment: true });
    return '{"data":{"repository":null}}';
  });
  assert.deepEqual(read.comment(330), {});
  assert.deepEqual(read.ownerSnapshot('comment-node'), { repository: null });
  assert.deepEqual(requests, [['GET', 'repos/owner/project/issues/comments/330'], ['POST', 'graphql']]);
  const failed = githubCliReader({ repo, number: 7 }, () => '{"data":{},"errors":[{"message":"private details"}]}');
  assert.throws(() => failed.ownerSnapshot(), /^Error: GitHub did not provide owner attestation metadata$/);
});
