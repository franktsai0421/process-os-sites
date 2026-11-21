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
    const match = /^(100644) blob ([0-9a-f]{40})/.exec(line);
    requireReview(match && line.slice(match[0].length) === '\t' + path + '\0',
      'Expected a regular, non-executable source file: ' + path);
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

function assertPullMatches(pull, evidence) {
  requireReview(pull?.number === evidence.number && pull.state === 'open' &&
    pull.base?.ref === 'main' && pull.base?.repo?.full_name?.toLowerCase() === evidence.repo &&
    pull.base?.sha === evidence.base && pull.head?.sha === evidence.head, 'The live pull request does not match the review evidence');
}

function pullIdentities(pull, evidence) {
  assertPullMatches(pull, evidence);
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

const ownerSnapshotQuery = `query RoutineOwnerSnapshot(
  $owner: String!, $name: String!, $number: Int!, $comment: ID!, $readComment: Boolean!
) {
  repository(owner: $owner, name: $name) {
    id
    pullRequest(number: $number) {
      id state baseRefOid headRefOid
      timelineItems(last: 1, itemTypes: [
        BASE_REF_CHANGED_EVENT, BASE_REF_DELETED_EVENT, BASE_REF_FORCE_PUSHED_EVENT,
        HEAD_REF_DELETED_EVENT, HEAD_REF_FORCE_PUSHED_EVENT, HEAD_REF_RESTORED_EVENT,
        CLOSED_EVENT, REOPENED_EVENT
      ]) {
        nodes { ... on Node { id } }
      }
    }
  }
  attestation: node(id: $comment) @include(if: $readComment) {
    ... on IssueComment {
      id body authorAssociation createdViaEmail isMinimized includesCreatedEdit lastEditedAt
      editor { login }
      author { __typename login ... on User { id } }
      pullRequest { id }
    }
  }
}`;

function ownerAttestationEvidence(evidence, pull, metadata) {
  assertPullMatches(pull, evidence);
  const repository = pull.base.repo;
  const owner = repository.owner;
  requireReview(repository.private === true && Number.isSafeInteger(repository.id) && repository.id > 0 &&
    pull.head.repo?.id === repository.id && owner?.type === 'User' &&
    Number.isSafeInteger(owner.id) && owner.id > 0 && typeof owner.login === 'string' &&
    typeof owner.node_id === 'string' && owner.node_id.length > 0 &&
    pull.user?.type === 'User' && pull.user.id === owner.id,
  'Solo attestation requires an owner-authored PR within the same private personal repository');
  const snapshot = metadata?.repository?.pullRequest;
  const events = snapshot?.timelineItems?.nodes;
  requireReview(typeof repository.node_id === 'string' && repository.node_id.length > 0 &&
    metadata?.repository?.id === repository.node_id && typeof pull.node_id === 'string' &&
    pull.node_id.length > 0 && snapshot?.id === pull.node_id && snapshot.state === 'OPEN' &&
    snapshot.baseRefOid === evidence.base && snapshot.headRefOid === evidence.head &&
    Array.isArray(events) && events.length <= 1 &&
    (events.length === 0 || typeof events[0]?.id === 'string' && events[0].id.length > 0),
  'GitHub revision history is missing or does not match the current pull request');
  // A new head or base already changes the digest. The timeline also fences
  // ref changes that later restore the very same Git commits.
  const revisionEvent = events[0]?.id ?? null;
  const digest = sha256(JSON.stringify(['routine-owner-attestation-v1', repository.id, pull.node_id,
    owner.id, revisionEvent, evidence.challenge]));
  return { ...evidence, repositoryId: repository.id, pullId: pull.node_id, ownerId: owner.id,
    ownerNode: owner.node_id, owner: owner.login.toLowerCase(), revisionEvent,
    statement: 'Routine source owner attestation SHA-256 ' + digest };
}

async function verifyOwnerAttestation(evidence, commentId, read) {
  requireReview(Number.isSafeInteger(commentId) && commentId > 0, 'Use the numeric GitHub issue comment ID');
  const observe = async () => {
    const pull = await read('');
    const comment = await read.comment(commentId);
    requireReview(comment?.id === commentId && typeof comment.node_id === 'string' && comment.node_id.length > 0 &&
      comment.performed_via_github_app === null && Number.isFinite(Date.parse(comment.created_at)) &&
      comment.updated_at === comment.created_at, 'Expected an original GitHub comment with no app attribution');
    const metadata = await read.ownerSnapshot(comment.node_id);
    const current = ownerAttestationEvidence(evidence, pull, metadata);
    const details = metadata.attestation;
    requireReview(comment.user?.id === current.ownerId && comment.user.type === 'User' &&
      comment.user.login?.toLowerCase() === current.owner && comment.author_association === 'OWNER' &&
      details?.id === comment.node_id && details.pullRequest?.id === current.pullId &&
      details.authorAssociation === 'OWNER' && details.author?.__typename === 'User' &&
      details.author.id === current.ownerNode && details.author.login?.toLowerCase() === current.owner &&
      details.editor === null && details.lastEditedAt === null && details.includesCreatedEdit === false &&
      details.createdViaEmail === false && details.isMinimized === false,
    'GitHub did not verify an unedited statement by the repository owner on this pull request');
    requireReview(comment.body === current.statement && details.body === current.statement,
      'Owner statement does not match the current source revision and digests');
    return { state: 'github-owner-attestation-observed', commentId, ...current };
  };
  const before = await observe(), after = await observe();
  requireReview(JSON.stringify(before) === JSON.stringify(after), 'Owner attestation changed while it was being checked');
  return after;
}

function githubCliReader(evidence, exec = execFileSync) {
  const repoEndpoint = 'repos/' + evidence.repo;
  const request = (endpoint, query) => {
    try {
      return JSON.parse(exec('gh', [
        'api', '--hostname', 'github.com', '--method', query ? 'POST' : 'GET',
        '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28',
        ...(query ? ['--input', '-'] : []), endpoint,
      ], {
        timeout: 10_000, stdio: [query ? 'pipe' : 'ignore', 'pipe', 'ignore'],
        ...(query ? { input: JSON.stringify(query) } : {}),
        env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
      }));
    } catch {
      throw new Error('GitHub CLI review lookup failed. Use an existing account with read access to the repository.');
    }
  };
  const read = suffix => request(repoEndpoint + '/pulls/' + evidence.number + suffix);
  read.comment = id => request(repoEndpoint + '/issues/comments/' + id);
  read.ownerSnapshot = comment => {
    const [owner, name] = evidence.repo.split('/');
    const result = request('graphql', { query: ownerSnapshotQuery,
      variables: { owner, name, number: evidence.number, comment: comment ?? '', readComment: comment !== undefined } });
    requireReview(result?.data && !result.errors, 'GitHub did not provide owner attestation metadata');
    return result.data;
  };
  return read;
}

async function run([command, repo, pr, base, head, ...extra]) {
  const independent = command === 'evidence' && extra.length === 0 ||
    command === 'verify' && (extra.length === 0 || extra.length === 1 && extra[0] === '--github-cli');
  const solo = command === 'owner-evidence' && extra.length === 0 ||
    command === 'owner-verify' && extra.length === 1 && /^\d+$/.test(extra[0]);
  requireReview((independent || solo) && /^\d+$/.test(pr),
    'Usage: node scripts/routine-source-review.cjs <evidence|verify|owner-evidence|owner-verify> ' +
    '<owner/repo> <PR> <base SHA> <head SHA> [--github-cli for verify | comment ID for owner-verify]');
  const evidence = sourceEvidence(repo, Number(pr), base, head);
  const read = solo || extra[0] === '--github-cli' ? githubCliReader(evidence) : async suffix => {
    const url = 'https://api.github.com/repos/' + evidence.repo + '/pulls/' + evidence.number + suffix;
    const response = await fetch(url, {
      redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    requireReview(response.ok, 'GitHub review lookup failed (HTTP ' + response.status + ')');
    return response.json();
  };
  let result = evidence;
  if (command === 'verify') result = await verifySourceReview(evidence, read);
  if (command === 'owner-evidence') result = ownerAttestationEvidence(evidence, await read(''), await read.ownerSnapshot());
  if (command === 'owner-verify') result = await verifyOwnerAttestation(evidence, Number(extra[0]), read);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  run(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { sourceEvidence, verifySourceReview, githubCliReader, ownerAttestationEvidence, verifyOwnerAttestation };
