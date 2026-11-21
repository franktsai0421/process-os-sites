const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { sourceEvidence, verifySourceReview, githubCliReader } = require('../scripts/routine-source-review.cjs');

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
