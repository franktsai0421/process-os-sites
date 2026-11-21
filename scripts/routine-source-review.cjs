// Read-only evidence for routine source review. Historical checks do not consume it.
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const paths = [
  'app/api/routine-fqc/route.ts',
  'app/api/routine-iqc/photo/route.ts',
  'app/api/routine-iqc/route.ts',
  'lib/routine-fqc-calendar.ts',
  'lib/routine-fqc.ts',
  'lib/routine-iqc-access.ts',
  'lib/routine-iqc-workflow.ts',
  'lib/routine-iqc.ts',
  'public/process/routine-fqc.css',
  'public/process/routine-fqc.js',
  'public/process/routine-iqc.css',
  'public/process/routine-iqc.js',
];
const prefix = 'Routine source review SHA-256 ';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function requireReview(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceEvidence(repo, number, base, head, cwd = process.cwd()) {
  requireReview(typeof repo === 'string' && /^[\w-]+\/[\w.-]+$/.test(repo) && !repo.endsWith('/.') &&
    !repo.endsWith('/..') && Number.isSafeInteger(number) && number > 0, 'Invalid repository or pull request number');
  for (const sha of [base, head]) {
    requireReview(typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha), 'Use full lowercase commit IDs');
  }
  const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd });
  for (const sha of [base, head]) {
    requireReview(git('cat-file', '-t', sha).toString().trim() === 'commit', 'Expected a Git commit');
  }
  git('merge-base', '--is-ancestor', base, head);
  const entry = (commit, path) => {
    const line = git('ls-tree', '-z', commit, '--', path).toString();
    if (!line) return null;
    const match = /^(100644) blob ([0-9a-f]{40})\t([^\0]+)\0$/.exec(line);
    requireReview(match?.[3] === path, 'Expected a regular, non-executable source file: ' + path);
    return { mode: match[1], blob: match[2] };
  };
  const digest = file => file ? { ...file, sha256: sha256(git('cat-file', 'blob', file.blob)) } : null;
  const files = paths.flatMap(path => {
    const before = entry(base, path), after = entry(head, path);
    return before?.blob === after?.blob ? [] : [{ path, before: digest(before), after: digest(after) }];
  });
  requireReview(files.length, 'No changed routine source files in scope');
  const payload = { format: 'routine-source-review-v1', repo: repo.toLowerCase(), number, base, head, files };
  return { ...payload, challenge: prefix + sha256(Buffer.from(JSON.stringify(payload), 'utf8')) };
}

function pullIdentities(pull, evidence) {
  requireReview(pull?.number === evidence.number && pull.state === 'open' &&
    pull.base?.ref === 'main' && pull.base?.repo?.full_name?.toLowerCase() === evidence.repo &&
    pull.base?.sha === evidence.base && pull.head?.sha === evidence.head, 'The live pull request does not match the review evidence');
  const owner = pull.base.repo.owner, author = pull.user;
  requireReview(owner?.type === 'User' && typeof owner.login === 'string' && Number.isSafeInteger(owner.id) &&
    author?.type === 'User' && Number.isSafeInteger(author.id), 'The trusted reviewer policy requires a personal repository and human author account');
  requireReview(owner.id !== author.id, 'The repository owner cannot review their own pull request');
  requireReview(Number.isInteger(pull.commits) && pull.commits >= 1 && pull.commits <= 250,
    'The exact pull request commit list is unavailable');
  return { ownerId: owner.id, ownerLogin: owner.login.toLowerCase(), authorId: author.id, commits: pull.commits };
}

async function checkContributors(read, identities, head) {
  // Restrict this initial procedure to signed, single-contributor PRs. Reject
  // unlinked Git identities rather than trusting author text as identity.
  const ids = new Set();
  let last;
  for (let page = 1; ids.size < identities.commits; page++) {
    const batch = await read('/commits?per_page=100&page=' + page);
    requireReview(Array.isArray(batch) && batch.length > 0 && batch.length <= 100, 'Incomplete commit list');
    for (const row of batch) {
      requireReview(typeof row?.sha === 'string' && /^[0-9a-f]{40}$/.test(row.sha) && !ids.has(row.sha),
        'Invalid or repeated commit in pull request');
      const verified = row.commit?.verification;
      requireReview(row.author?.id === identities.authorId && row.author.type === 'User' &&
        row.committer?.id === identities.authorId && row.committer.type === 'User' &&
        verified?.verified === true && verified.reason === 'valid',
        'Expected a verified signed commit by the independent pull request author');
      requireReview(typeof row.commit.message === 'string' && !/^Co-authored-by\s*:/im.test(row.commit.message),
        'Co-authored commits require a separate maintainer procedure');
      ids.add(row.sha);
      last = row.sha;
    }
  }
  requireReview(ids.size === identities.commits && last === head, 'The commit list does not match the reviewed head');
}

async function latestOwnerReview(read, identities) {
  let latest;
  for (let page = 1; page <= 20; page++) {
    const reviews = await read('/reviews?per_page=100&page=' + page);
    requireReview(Array.isArray(reviews) && reviews.length <= 100, 'Invalid review response');
    for (const review of reviews) {
      if (review?.user?.id !== identities.ownerId) continue;
      requireReview(review.user.type === 'User' && review.user.login?.toLowerCase() === identities.ownerLogin &&
        review.author_association === 'OWNER', 'Repository owner review identity changed');
      if (review.state === 'COMMENTED' || review.state === 'PENDING') continue;
      requireReview(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state) &&
        Number.isSafeInteger(review.id) && Number.isFinite(Date.parse(review.submitted_at)), 'Invalid repository owner review state');
      latest = review;
    }
    if (reviews.length < 100) return latest;
  }
  throw new Error('Review pagination limit reached before the last page');
}

function exactApproval(review, evidence) {
  requireReview(review?.state === 'APPROVED' && review.commit_id === evidence.head &&
    typeof review.body === 'string', 'No current independent approval for these bytes');
  const declarations = review.body.split(/\r?\n/).filter(line => line.startsWith(prefix));
  requireReview(declarations.length === 1 && declarations[0] === evidence.challenge, 'Approval does not declare the exact review digest');
  return review.id;
}

async function verifySourceReview(evidence, read) {
  const identities = pullIdentities(await read(''), evidence);
  await checkContributors(read, identities, evidence.head);
  const review = exactApproval(await latestOwnerReview(read, identities), evidence);
  const nextReview = exactApproval(await latestOwnerReview(read, identities), evidence);
  const nextIdentities = pullIdentities(await read(''), evidence);
  requireReview(review === nextReview && JSON.stringify(identities) === JSON.stringify(nextIdentities),
    'Review state changed while it was being checked');
  return { state: 'github-review-observed', review, reviewer: identities.ownerLogin, ...evidence };
}

async function run([command, repo, pr, base, head, ...extra]) {
  requireReview(['evidence', 'verify'].includes(command) && extra.length === 0 && /^\d+$/.test(pr),
    'Usage: node scripts/routine-source-review.cjs <evidence|verify> <owner/repo> <PR> <base SHA> <head SHA>');
  const evidence = sourceEvidence(repo, Number(pr), base, head);
  const read = async suffix => {
    const url = 'https://api.github.com/repos/' + evidence.repo + '/pulls/' + evidence.number + suffix;
    const response = await fetch(url, {
      redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    requireReview(response.ok, 'GitHub review lookup failed (HTTP ' + response.status + ')');
    return response.json();
  };
  const result = command === 'verify' ? await verifySourceReview(evidence, read) : evidence;
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  run(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { sourceEvidence, verifySourceReview };
