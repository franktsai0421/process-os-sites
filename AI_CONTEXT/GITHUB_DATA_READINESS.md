> 狀態：Historical / Deprecated as current guidance。原日期驗證或安全評估完整保留，不代表本次checkout／目前依賴／部署狀態，也不是建立新Git歷史或操作其他副本的指令。現況：[AI_CONTEXT](AI_CONTEXT.md)；資料：[DATA_MODEL](DATA_MODEL.md)；接续：[HANDOFF](../HANDOFF.md)。

# GitHub pre-upload verification — 2026-09-17

The clean candidate is `repository root`. Only this candidate may receive a new local Git history. No GitHub repository, remote, upload, Staging connection, Production connection or deployment is part of this verification.

## Reviewed baseline

Frank confirmed retention of all approved business records, including manufacturing test equipment. Drafts, accounts, identity fields, credentials, sessions and operation/audit history are excluded.

`data/canonical/` contains 16 domain files and their manifest, with 7,971 records. Counts: products 439, categories 44, lines 3, stages 22, parts 913, BOM 6,214, processes 110, process versions 6, master versions 8, role templates 3, dispatch records 3, settings 1 and asset indexes 205. Standalone FQC/IQC/IPQC start empty; existing approved process-node IPQC is retained. Quality collaboration support is not a newly implemented quality UI.

Schema and bootstrap versions are 1. Git attributes preserve Canonical LF bytes across Windows checkout. Baseline dataVersion:

```text
a92c7f7d9be97543777ad37ca3412134c9682b29f1052b0f62c5789d76155f5e
```

Private original asset bytes stay outside Git. Clone uses a portable placeholder and content-addressed indexes. Existing Local media remains local. No Production media was downloaded.

## Verified behavior

- Real `npm install` and `npm run dev` completed in the clean candidate. A second empty isolated copy completed installation from the temporary npm cache with external runtime access blocked.
- Empty Local initialized using only the two existing migrations, latest Canonical and three passwordless demo identities. Restart preserved revision, identities and logical content.
- ADMIN/RD/STAFF entry names, positions and permissions were checked through real Local APIs and browser clicks. Unset/true allows demo; false rejects direct login and existing signed demo Sessions. Arbitrary identity, permission and line inputs are rejected.
- Desktop 1366×900 and mobile 390×844 retained three usable entries without horizontal overflow. Disabled-demo errors remain visible, including at mobile viewport height.
- Stable export and repeated sync reported zero changes. Same-ID three-way conflict and unexported edits were refused. Invalid relations were refused. Explicit tombstones were tested.
- Real local Git simulations merged independent FQC/IPQC changes and synchronized a third Local. Same-record conflicts preserved both branch versions. These simulations used disposable repositories without remotes.
- Failed sync verification restored its verified physical backup. A separate isolated copy restored the existing-data rehearsal backup and recovered original logical accounts and business content.
- Build, TypeScript, demo/schema/init/Canonical/merge/task tests and existing data, backup, R2, process, release, consistency, version, UI-source and Chinese/Vietnamese regression checks passed.

## Runtime diagnosis and isolation

Project `.npmrc` disables the parent npm CLI's version-update check. Application runtime guard and offline fixture configuration remain separate safeguards.

Installed Miniflare uses its supported built-in Request.cf fixture. No installed package was patched. Vite's stock port-availability check previously attempted wildcard-address probes; the guard blocked them. The Local launcher now uses the public HTTP server API with explicit `127.0.0.1` binding, avoiding those probes.

Final candidate launcher audit: 35 operations, zero non-loopback attempts. Final fresh-copy audit: 50 operations, zero non-loopback attempts. Observed owned Node/workerd sockets were loopback. Node audit is application-level evidence, not a packet capture of every native/browser process. External browser resources were removed and Local CSP restricts resources to local/data/blob sources.

## Original data and backup protection

New verified backup and private evidence are under `Local backup directory`. The original Local was never converted or written. Three demo identities were appended only in the new rehearsal; existing account values and all other business keys were unchanged. The separate restoration rehearsal passed.

Original 23 Local files retain their paths, sizes and SHA-256 values. List digest:

```text
19885982f4e1643aec9e0fcb24aafcdaaa1b9981ea798d5b52fdaf5262f90cf9
```

The entire protected `20260916-163436-990` backup, including its report and rehearsal files, was compared without following symbolic links. Its 43,670-entry digest remained unchanged:

```text
a4bf951403a6e67878bed8cd6940e1387283622a555519d60ab36bb524816db2
```

The new 24-file physical backup and original Local settings remained unchanged. `.openai/hosting.json` retained its original hash and formal project mapping. No existing migration was changed. The original archive remains outside candidate Git.

## Scope and continuing responsibilities

**測試階段快捷入口預設開放；正式營運前必須由Frank明確確認關閉。** Demo ADMIN retains existing testing privileges.

The original source repository and old backups retain their earlier history/content and are not the upload candidate. Existing Frank Local demo conversion, formal account/password-hash conversion and Production activation are separate future work. Pattern scans detect known secret formats and excluded file classes; future free-text business data and media still require human review.

See [LOCAL_DATA_COLLABORATION.md](LOCAL_DATA_COLLABORATION.md) for export/sync, physical recovery, task safeguards and future Staging specifications. Staging remains documentation only; Git merge never updates Production.
