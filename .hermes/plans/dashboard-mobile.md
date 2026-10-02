# Public dashboard and mobile pass

## Final state

- Anonymous users can view only the read-only dashboard; it has no app
  navbar/header and links to sign-in.
- All other views, including `/standings`, require authentication.
- Signed-in users retain desktop navigation and get a compact, native mobile
  menu.
- Main content accounts for safe areas, narrow forms no longer cause page
  overflow, and wide tables expose keyboard/touch scroll hints.
- E2E setup points every fixture at its isolated database before importing the
  app database singleton; both seeded and empty-db runs are supported.

## Implementation

- [x] Restrict anonymous access to GET/HEAD `/`; protect planning, organiser,
      and standings views.
- [x] Hide app chrome for signed-out visitors; preserve signed-in navigation and
      add the dashboard sign-in action.
- [x] Improve mobile layouts, safe-area insets, form sizing, scrollable table
      accessibility, and viewport checks.
- [x] Update route documentation and exercise anonymous/authenticated behavior
      in E2E tests.

## Verification

- `deno task check` — passed.
- `deno task test` — 49/49 passed.
- `deno task build` — passed.
- E2E without fixtures — 251/251 passed.
- Seeded E2E — 251/251 passed.
- Playwright responsive checks covered 320, 360, 390, 768, 900, 1023, 1024, and
  1280px across the dashboard, login, and authenticated routes. No header
  overlap, document-level horizontal overflow, or console errors.

## Deferred

- No authentication model or database/schema changes; no release or deployment.
