# Inactive private-test root entry

The proxy runs the import gate before app/page.tsx can redirect to /login. A
known inactive target therefore needs its own root navigation response. GET and
HEAD of exactly / return a bilingual, no-store HTML shell with ordinary top-level
links to /login and /setup/owner. HEAD has no body. The text states that company
data is unavailable and owner setup needs its separately enabled window. It
does not claim that an account exists or that import/activation succeeded.

Only this known inactive root navigation changes. Non-GET/HEAD root requests,
APIs, business pages and company images keep the original 503 JSON gate. Database
errors also keep that response, including at the root. Existing exact login,
setup, asset and Sites-reserved paths pass as before. An active target or a
disabled import gate leaves routing unchanged. No request value, identity or
secret is embedded in the HTML; the shell has no scripts, forms or cookies.

The platform private gate, authentication, bootstrap configuration, data schema
and storage are unchanged. Root navigation is not owner-login acceptance. The
separate secure signer/bootstrap handoff remains outside this UI correction.

Verification consists of the root-entry gate unit cases, compiled application
HTTP cases with empty nonpersistent D1/R2 and no secrets, affected owner/import
regressions, full types/build and desktop/mobile viewport QA. Viewport emulation
does not establish physical iOS Site-wrapper behavior. Exact commit/results are
recorded in the task and PR. Frank merges; source synchronization and private
publication happen later, never from the unmerged work branch.
