# Fixed R1 three-file startup supplement

The active R1 operational import lacks three private startup scripts. The paired
R1 program archive contains them, but `public/process/data` is correctly excluded
from source-only publication. The R1 data archive's static section contains only
IQC/routine images, so the generated company-assets index has no data-script
entries. Do not publish the business payloads in Git or put public stubs in their
place. Do not rerun the full import or modify its completed records.

`/setup/startup-assets` and `/api/setup/startup-assets` support exactly the three
SHA/size pins in `lib/startup-assets.mjs`. The original R1 paired program archive
is 25,886,079 bytes, SHA-256
`0b486facd715434155092cd03682dbd1820c95c92af5a41f5033e8ee460cb6ab`.
The three streams total 1,386,533 bytes. The equipment-source JSON is excluded.

The writer requires the fixed project/origin/owner, a normal enabled Frank admin
session with `master.export`, bootstrap/recovery/observation off, the fixed active
transfer/target/manifest and completed budget with no request lock. The original
index is pinned to 304 entries and SHA
`d740b8a50ad1a2c4fd671e3148f18c7bc007b9d3f212722282e7be1edcf1e347`.
Each fixed file is streamed within a size/deadline, checked against its original
SHA, admitted once in the existing attempts table, conditionally created, then
fully read back. The final index requires all three complete receipts/readbacks,
retains every original entry, and uses the observed ETag conditional PUT followed
by complete readback. No schema, main budget/charges, account, state, activation,
or source backup changes are performed.

The original index remains recoverable in the retained sealed import chunks;
these are not deleted or rewritten. Original import receipts continue to describe
their original input. Supplemental records use `startup-r1-three-v1:*` IDs and
`startup-asset` action in `process_import_attempts`. A failed or uncertain admitted
operation remains pending/unknown in the public summary; durable rows use the
existing schema's `running`/`stopped` states. There is no schema change and no unlock/reset or automatic write
replay. A lost response permits one bounded status read. Stop/cancel never claims
the provider side effect was undone. Source, object, and receipt mismatches stop.

The three reader entries use `users.view` rather than a broad OR of module views.
`companyAsset` additionally requires the exact normal Frank admin/platform
session with `master.export` for these three paths and their pinned object keys,
including any future URL alias. Other admins and single-module employees cannot
read complete seed bytes. The original 304 entries retain their original ACLs.
No account permission is changed. Headers remain no-store, object size/SHA
metadata checks remain, and payloads stay out of public assets. Employee startup
is not accepted by this owner-only fix: role-specific startup remains a separate
scope requiring design and validation, not a reason to open complete seeds.

The UI accepts the three pinned files and submits them sequentially once, then
publishes the index. Supported browser file selection can select verified private
local copies without the user finding paths. A normal owner session is required;
no cookies or credentials may be extracted to automate the upload. Source Git
credentials are separate and retain their per-action authorization requirement.

Required evidence: synthetic negative source/pin/auth/lock cases, concurrent
admission, provider-side-effect/lost-ACK and settlement failure, conditional index
conflict, real stream deadline cleanup, compiled HTTP authorization and actual
ephemeral D1/R2 behavior, type/build/source scan and exact-head CI. Live acceptance
requires the three authorized asset responses, all 80 startup dependencies, real
home-page startup, correct data, and desktop/mobile/role checks. Synthetic success
or a supplemental receipt alone is not that acceptance.
