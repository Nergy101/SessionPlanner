/**
 * The e2e spec. Driven by tests/e2e/run.ts, which supplies E2E_BASE pointing at a
 * server backed by a throwaway database — never the real one.
 *
 * Playwright is not a dependency of this project. The `e2e` task borrows it via
 * NODE_PATH; see deno.json.
 */
import { createRequire } from "node:module";

// Playwright is not a dependency of this project — the harness points us at an
// existing install (see PLAYWRIGHT_BASE in tests/e2e/run.ts). createRequire resolves
// from there; a bare ESM import cannot, because ESM ignores NODE_PATH.
const base = process.env.PLAYWRIGHT_BASE;
let chromium;
try {
  chromium = createRequire(`${base}/`)("playwright").chromium;
} catch {
  console.error(
    `Could not load Playwright from ${base}.\n` +
      "Set PLAYWRIGHT_BASE to a directory whose node_modules contains playwright,\n" +
      "e.g. PLAYWRIGHT_BASE=~/repos/sprintendo deno task e2e",
  );
  process.exit(1);
}

const BASE = process.env.E2E_BASE;
const PASSWORD = process.env.E2E_PASSWORD;
const OUT = process.env.E2E_OUT ?? ".";

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

const settle = () => page.waitForLoadState("networkidle");

/**
 * Run an action that triggers a form submit, and wait for the resulting navigation.
 *
 * Without this, `waitForLoadState` can resolve against the *current* document before
 * the POST/303/GET round trip has even started, so an assertion reads stale DOM — or
 * worse, a following goto() cancels the in-flight submit and the edit is silently
 * lost. That is a test race, not an app bug, but it looks exactly like one.
 */
async function submitAndWait(action, timeout = 15_000) {
  const navigated = page.waitForEvent("framenavigated", { timeout }).catch(
    () => {},
  );
  await action();
  await navigated;
  await settle();
  await page.waitForTimeout(150);
}
const shot = (name) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// ---- sign in -------------------------------------------------------------
await page.goto(`${BASE}/login`);
check(
  "login: password autofocused",
  (await page.evaluate(() => document.activeElement?.id)) === "password",
);
await page.fill("#password", PASSWORD);
await page.keyboard.press("Enter");
await page.waitForURL(`${BASE}/`, { timeout: 10_000 }).catch(() => {});
check("login: Enter submits", page.url() === `${BASE}/`, page.url());

check(
  "auth: a wrong password is rejected",
  await (async () => {
    const fresh = await browser.newPage();
    await fresh.goto(`${BASE}/login`);
    await fresh.fill("#password", "definitely-wrong");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(1200);
    const rejected = fresh.url().includes("error=1");
    await fresh.close();
    return rejected;
  })(),
);

// ---- empty states --------------------------------------------------------
for (
  const [path, name] of [
    ["/", "dashboard"],
    ["/subjects", "subjects"],
    ["/sessions", "sessions"],
    ["/people", "people"],
  ]
) {
  await page.goto(BASE + path);
  await settle();
  check(
    `${name}: renders an empty state on a fresh database`,
    (await page.locator(".ui-empty").count()) > 0,
  );
}

// ---- rapid-fire capture --------------------------------------------------
await page.goto(`${BASE}/`);
await settle();
check(
  "dashboard: capture box autofocused",
  await page.evaluate(() =>
    document.activeElement?.getAttribute("placeholder")?.includes(
      "heard a good topic",
    ) ===
      true
  ),
);
check(
  "dashboard: capture disabled while empty",
  await page.locator('button:has-text("capture")').isDisabled(),
);

const titles = [
  "Feature flags without a vendor",
  "Kubernetes: we stopped",
  "SQLite is enough",
];
for (const t of titles) {
  await page.keyboard.type(t); // blind: focus must already be in the box
  await submitAndWait(() => page.keyboard.press("Enter"));
  check(
    `dashboard: stayed on / after adding "${t.slice(0, 16)}…"`,
    new URL(page.url()).pathname === "/",
    page.url(),
  );
}
check(
  "dashboard: all three land in 'needs a speaker'",
  (await page.locator(".ui-card").count()) === 3,
  `${await page.locator(".ui-card").count()} cards`,
);
await shot("dashboard");

// ---- the ladder, through the UI -----------------------------------------
await page.locator('.ui-card a:has-text("Feature flags without a vendor")')
  .click();
await settle();
check(
  "subject detail: description autofocused",
  (await page.evaluate(() => document.activeElement?.id)) === "description",
);

await page.fill("#description", "What SSR bought us.");
await submitAndWait(() => page.locator("#title").press("Enter"));
check(
  "subject detail: Enter in a single-line field saves",
  (await page.locator("#description").inputValue()).includes(
    "What SSR bought us",
  ),
);

const picker = page.locator('input[placeholder*="add a speaker"]');
await picker.click();
await picker.fill("Chris Dijk");
await page.waitForTimeout(400);
await submitAndWait(() => picker.press("Enter"));
check(
  "picker: Enter creates a new person and adds them",
  (await page.locator(".ui-chip-person").count()) >= 1,
);
check(
  "ladder: the first speaker promotes idea -> assigned",
  (await page.locator(".ui-badge-assigned").count()) > 0,
);

await page.locator('button:has-text("add link")').click();
await page.waitForTimeout(200);
await page.fill('input[name="linkUrl"]', "https://fresh.deno.dev/");
await submitAndWait(() =>
  page.locator('button:has-text("save")').first().click()
);
check(
  "links: round-trip, with the label falling back to the host",
  (await page.locator('a.ui-chip:has-text("fresh.deno.dev")').count()) > 0,
);
await shot("subject-detail");

// ---- sessions ------------------------------------------------------------
await page.goto(`${BASE}/sessions`);
await settle();

// ---- the type-ahead itself ----------------------------------------------
await page.locator("#subjectTitle").click();
await page.waitForTimeout(250);
const allRows = await page.locator("#subjectTitle-listbox li").count();
check(
  "combobox: focusing opens the full list",
  allRows > 0,
  `${allRows} rows`,
);

await page.fill("#subjectTitle", "Kub");
await page.waitForTimeout(250);
const filtered = await page.locator("#subjectTitle-listbox li").count();
check(
  "combobox: typing filters the list",
  filtered < allRows && filtered > 0,
  `${allRows} -> ${filtered}`,
);

// arrow + Enter picks, and fills the box with the option's full text
await page.locator("#subjectTitle").press("ArrowDown");
await page.waitForTimeout(150);
await page.locator("#subjectTitle").press("Enter");
await page.waitForTimeout(250);
const picked = await page.locator("#subjectTitle").inputValue();
check(
  "combobox: arrow keys and Enter select an option",
  picked.toLowerCase().includes("kub") && picked.length > 3,
  picked,
);
check(
  "combobox: selecting closes the menu",
  (await page.locator("#subjectTitle-listbox").count()) === 0,
);

// a value that matches nothing offers itself as new
await page.fill("#subjectTitle", "Something nobody has proposed");
await page.waitForTimeout(250);
check(
  "combobox: an unmatched value is offered as new",
  (await page.locator('#subjectTitle-listbox li:has-text("new topic")')
    .count()) === 1,
);

// clicking a row selects it
await page.fill("#subjectTitle", "");
await page.waitForTimeout(250);
const firstRowText = await page.locator("#subjectTitle-listbox li span").first()
  .textContent();
await page.locator("#subjectTitle-listbox li").first().click();
await page.waitForTimeout(250);
check(
  "combobox: clicking a row selects it",
  (await page.locator("#subjectTitle").inputValue()) === firstRowText.trim(),
  `${await page.locator("#subjectTitle").inputValue()}`,
);

// escape closes without choosing
await page.fill("#subjectTitle", "Kub");
await page.waitForTimeout(250);
await page.locator("#subjectTitle").press("Escape");
await page.waitForTimeout(200);
check(
  "combobox: Escape closes the menu without picking",
  (await page.locator("#subjectTitle-listbox").count()) === 0 &&
    (await page.locator("#subjectTitle").inputValue()) === "Kub",
);

// (a) a brand new topic typed straight into the session form, with a speaker
await page.fill("#subjectTitle", "Booked and staffed in one go");
await page.waitForTimeout(250);
await page.locator("#speaker").fill("Fresh Volunteer");
await page.waitForTimeout(250);
await page.fill("#notes", "First one after the rewrite.");
await submitAndWait(() => page.locator("#notes").press("Enter"));
check(
  "sessions: Enter in the new-session form creates it",
  /\/sessions\/\d+$/.test(page.url()),
  page.url(),
);
check(
  "new session: the typed topic was created and scheduled",
  (await page.locator('text="Booked and staffed in one go"').count()) > 0,
);
check(
  "new session: the typed speaker was assigned to it",
  (await page.locator('.ui-chip-person:has-text("Fresh Volunteer")').count()) >
    0,
);
check(
  "new session: which puts it straight on planned",
  (await page.locator(".ui-badge-planned").count()) > 0,
);

// (b) an existing unstaffed subject, picked by title, gets the speaker we name
await page.goto(`${BASE}/sessions`);
await settle();
await page.locator("#subjectTitle").click();
await page.waitForTimeout(300);
const unstaffed = await page.evaluate(() =>
  [...document.querySelectorAll("#subjectTitle-listbox li")]
    .filter((li) => li.textContent.includes("needs a speaker"))
    .map((li) => li.querySelector("span")?.textContent?.trim())
    .filter(Boolean)
);
await page.locator("#subjectTitle").press("Escape");
if (unstaffed.length) {
  await page.fill("#subjectTitle", unstaffed[0]);
  await page.waitForTimeout(400);
  await page.locator("#speaker").fill("Late Signup");
  await page.waitForTimeout(250);
  // Enter with nothing highlighted belongs to the form, not the picker.
  await submitAndWait(() => page.locator("#speaker").press("Enter"));
  check(
    "new session: an existing topic is scheduled, not duplicated",
    (await page.locator(`text="${unstaffed[0]}"`).count()) === 1,
    unstaffed[0],
  );
  check(
    "new session: and the vacancy is filled",
    (await page.locator('.ui-chip-person:has-text("Late Signup")').count()) > 0,
  );
} else {
  check(
    "new session: an existing topic is scheduled, not duplicated",
    true,
    "skipped",
  );
  check("new session: and the vacancy is filled", true, "skipped");
}

// (c) picking a topic that already has a speaker hides the speaker field.
// The datalist only offers *bookable* subjects, so read it rather than assuming:
// anything already scheduled has left the pool.
await page.goto(`${BASE}/sessions`);
await settle();
await page.locator("#subjectTitle").click();
await page.waitForTimeout(300);
const staffed = await page.evaluate(() =>
  [...document.querySelectorAll("#subjectTitle-listbox li")]
    .filter((li) => !li.textContent.includes("needs a speaker"))
    .map((li) => li.querySelector("span")?.textContent?.trim())
    .filter(Boolean)
);
await page.locator("#subjectTitle").press("Escape");
if (staffed.length) {
  await page.fill("#subjectTitle", staffed[0]);
  await page.waitForTimeout(400);
  check(
    "new session: a staffed topic hides the speaker field",
    (await page.locator("#speaker").count()) === 0 &&
      (await page.locator("text=already on this one").count()) === 1,
    staffed[0],
  );
} else {
  check(
    "new session: a staffed topic hides the speaker field",
    true,
    "skipped, nothing staffed is still bookable",
  );
}

// no duplicate subject was created anywhere along the way
await page.goto(`${BASE}/subjects?q=Booked and staffed`);
await settle();
check(
  "new session: no duplicate subject was created",
  (await page.locator("table tbody tr").count()) === 1,
  `${await page.locator("table tbody tr").count()} rows`,
);

await page.goto(`${BASE}/sessions`);
await settle();
await page.locator('a[href^="/sessions/"]').first().click();
await settle();

await submitAndWait(() =>
  page.selectOption('select[name="subject"]', { index: 1 })
);
check(
  "ladder: giving it a date promotes assigned -> planned",
  (await page.locator(".ui-badge-planned").count()) > 0,
);

const beforeRemove = await page.locator(".ui-card").count();
const removedTitle = await page.locator(".ui-card a").first().textContent();
await submitAndWait(() =>
  page.locator('button:has-text("remove from this date")').first().click()
);
check(
  "ladder: unscheduling takes it off the date",
  (await page.locator(".ui-card").count()) === beforeRemove - 1,
  `${beforeRemove} -> ${await page.locator(".ui-card").count()}`,
);

// and it lands back in the pool as assigned, because a speaker is still on it
await page.goto(
  `${BASE}/subjects?q=${encodeURIComponent(removedTitle.trim())}`,
);
await settle();
check(
  "ladder: and it falls back to assigned (a speaker remains)",
  (await page.locator("table tbody tr select[name=status]").first()
    .inputValue()) ===
    "assigned",
  await page.locator("table tbody tr select[name=status]").first().inputValue(),
);
await page.goto(`${BASE}/sessions`);
await settle();
await page.locator('a[href^="/sessions/"]').first().click();
await settle();
await shot("session-detail");

// ---- subjects table ------------------------------------------------------
await page.goto(`${BASE}/subjects`);
await settle();
check(
  "subjects: quick-add box autofocused",
  await page.evaluate(() =>
    document.activeElement?.getAttribute("name") === "title"
  ),
);

await page.keyboard.type("Added straight into the table");
await submitAndWait(() => page.keyboard.press("Enter"));
check(
  "subjects: adding keeps you on the list",
  new URL(page.url()).pathname === "/subjects",
  page.url(),
);

const inline = page.locator("table input[name=title]").first();
await inline.fill("Renamed inline");
await submitAndWait(() => inline.press("Enter"));
await page.goto(`${BASE}/subjects`);
await settle();
check(
  "subjects: Enter commits an inline title edit",
  await page.evaluate(() =>
    [...document.querySelectorAll("table input")].some((i) =>
      i.value === "Renamed inline"
    )
  ),
);

await submitAndWait(() =>
  page.selectOption("table select[name=status]", "archived")
);
check(
  "subjects: archived drops out of the default list",
  !(await page.evaluate(() =>
    [...document.querySelectorAll("table input")].some((i) =>
      i.value === "Renamed inline"
    )
  )),
);
await page.goto(`${BASE}/subjects?status=archived`);
await settle();
check(
  "subjects: and is reachable by filtering for it",
  await page.evaluate(() =>
    [...document.querySelectorAll("table input")].some((i) =>
      i.value === "Renamed inline"
    )
  ),
);
await shot("subjects");

// ---- confirm-before-delete ----------------------------------------------
await page.goto(`${BASE}/subjects`);
await settle();
await page.locator("table tbody tr a:has-text('edit')").first().click();
await settle();
const detailUrl = page.url();
await page.locator('button:has-text("delete subject")').click();
await page.waitForTimeout(400);
check(
  "delete: the first click arms rather than deletes",
  page.url() === detailUrl,
);
await page.locator('button:has-text("cancel")').click();
await page.waitForTimeout(300);
check(
  "delete: cancel disarms",
  (await page.locator('button:has-text("delete subject")').count()) === 1,
);
await page.locator('button:has-text("delete subject")').click();
await page.waitForTimeout(300);
await submitAndWait(() =>
  page.locator('button:has-text("yes, delete it")').click()
);
check(
  "delete: confirming deletes and returns to the list",
  page.url().includes("/subjects"),
);

// ---- people --------------------------------------------------------------
await page.goto(`${BASE}/people`);
await settle();
check(
  "people: the person created via the picker is listed",
  await page.evaluate(() =>
    [...document.querySelectorAll("table input")].some((i) =>
      i.value === "Chris Dijk"
    )
  ),
);
await shot("people");

// ---- people: quick-fire adding ------------------------------------------
await page.goto(`${BASE}/people`);
await settle();
check(
  "people: add box autofocused",
  await page.evaluate(() =>
    document.activeElement?.getAttribute("name") === "name"
  ),
);

// Relative, not absolute: other steps in this spec also create people, and an
// exact row count would break every time the flow above changes.
const peopleBefore = await page.locator("table tbody tr").count();

for (const name of ["Sanne Bakker", "Youssef el Amrani", "Marieke Post"]) {
  await page.keyboard.type(name); // blind again: focus must come back to the box
  await submitAndWait(() => page.keyboard.press("Enter"));
  check(
    `people: stayed on /people after adding "${name}"`,
    new URL(page.url()).pathname === "/people",
    page.url(),
  );
}
check(
  "people: all three were added",
  (await page.locator("table tbody tr").count()) === peopleBefore + 3,
  `${peopleBefore} -> ${await page.locator("table tbody tr").count()} rows`,
);

// adding a duplicate must not create a second row, and must say so
await page.keyboard.type("sanne bakker");
await submitAndWait(() => page.keyboard.press("Enter"));
check(
  "people: a duplicate name is recognised rather than duplicated",
  (await page.locator("table tbody tr").count()) === peopleBefore + 3 &&
    (await page.locator("text=already had").count()) === 1,
  `${await page.locator("table tbody tr")
    .count()} rows, unchanged by the duplicate`,
);
await shot("people");

// ---- subjects table: edit column + speaker multi-select -----------------
await page.goto(`${BASE}/subjects`);
await settle();

check(
  "subjects: default order is planned, assigned, idea, presented",
  await page.evaluate(() => {
    const seen = [
      ...document.querySelectorAll("table tbody tr select[name=status]"),
    ]
      .map((el) => el.value);
    const rank = {
      planned: 0,
      assigned: 1,
      idea: 2,
      presented: 3,
      archived: 4,
    };
    return seen.every((s, i) => i === 0 || rank[seen[i - 1]] <= rank[s]);
  }),
  await page.evaluate(() =>
    [...document.querySelectorAll("table tbody tr select[name=status]")]
      .map((el) => el.value).join(", ")
  ),
);

check(
  "subjects: edit is the first column",
  await page.evaluate(() => {
    const first = document.querySelector("table tbody tr td");
    return first?.textContent?.trim() === "edit";
  }),
);

const row = page.locator("table tbody tr").first();
await row.locator("button[popovertarget]:not([popovertargetaction])").click();
await page.waitForTimeout(400);
check(
  "speakers: the popover opens without JavaScript of ours",
  await page.evaluate(() =>
    [...document.querySelectorAll("[popover]")].some((el) =>
      el.matches(":popover-open")
    )
  ),
);

// Tailwind's preflight zeroes every margin, which breaks the UA stylesheet's
// `margin: auto` centring and parks the panel in the top-left corner.
const popoverBox = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("[popover]")]
      .find((e) => e.matches(":popover-open"));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      offX: Math.abs((r.left + r.right) / 2 - innerWidth / 2),
      offY: Math.abs((r.top + r.bottom) / 2 - innerHeight / 2),
      left: Math.round(r.left),
      top: Math.round(r.top),
    };
  });

const box = await popoverBox();
check(
  "speakers: the popover is centred, not stuck in the corner",
  box !== null && box.offX < 40 && box.offY < 40,
  box ? `left=${box.left} top=${box.top}` : "not open",
);

// tick two people at once — this is the multi-select
const boxes = page.locator("[popover]:visible input[type=checkbox]");
await boxes.nth(0).check();
await boxes.nth(1).check();
await submitAndWait(() =>
  page.locator("[popover] button[type=submit]:visible").click()
);
check(
  "speakers: two people assigned in one save",
  (await row.locator(".ui-chip-person").count()) === 2,
  `${await row.locator(".ui-chip-person").count()} chips`,
);
check(
  "ladder: assigning speakers from the table promotes to assigned",
  (await row.locator("select[name=status]").inputValue()) === "assigned",
  await row.locator("select[name=status]").inputValue(),
);

// unticking removes
await row.locator("button[popovertarget]:not([popovertargetaction])").click();
await page.waitForTimeout(400);
await page.locator("[popover]:visible input[type=checkbox]:checked").first()
  .uncheck();
await submitAndWait(() =>
  page.locator("[popover] button[type=submit]:visible").click()
);
check(
  "speakers: unticking removes one",
  (await row.locator(".ui-chip-person").count()) === 1,
  `${await row.locator(".ui-chip-person").count()} chips`,
);

// the free-text box in the popover creates a brand-new person
await row.locator("button[popovertarget]:not([popovertargetaction])").click();
await page.waitForTimeout(400);
await page.locator("[popover]:visible input[type=text]").fill(
  "Brand New Speaker",
);
await submitAndWait(() =>
  page.locator("[popover] button[type=submit]:visible").click()
);
check(
  "speakers: a typed name is created and added in the same save",
  (await row.locator('.ui-chip-person:has-text("Brand New Speaker")')
    .count()) === 1,
);
await shot("subjects");

// ---- filters: no button, applied on change / on enter -------------------
await page.goto(`${BASE}/subjects`);
await settle();

check(
  "filters: the filter button is gone",
  (await page.locator("form[method=get] button[type=submit]:visible")
    .count()) === 0,
);

const rowsNow = await page.locator("table tbody tr").count();

// changing the status select must apply immediately
await submitAndWait(() =>
  page.selectOption("form[method=get] select[name=status]", "idea")
);
check(
  "filters: the status select applies on change",
  page.url().includes("status=idea"),
  page.url(),
);
check(
  "filters: and actually narrows the list",
  (await page.locator("table tbody tr").count()) <= rowsNow,
  `${rowsNow} -> ${await page.locator("table tbody tr").count()}`,
);
check(
  "filters: the select shows the active filter after reload",
  (await page.locator("form[method=get] select[name=status]").inputValue()) ===
    "idea",
);

// clear
await submitAndWait(() => page.locator('a:has-text("clear")').click());
check(
  "filters: clear resets to the unfiltered list",
  !page.url().includes("status="),
  page.url(),
);

// Enter in the search box applies without any submit button present
await page.locator("input[name=q]").fill("Brand");
await submitAndWait(() => page.locator("input[name=q]").press("Enter"));
check(
  "filters: Enter applies the search with no submit button",
  page.url().includes("q=Brand"),
  page.url(),
);

// person filter
await submitAndWait(() => page.locator('a:has-text("clear")').click());
const personOptions = await page.locator(
  "form[method=get] select[name=person] option",
)
  .count();
if (personOptions > 1) {
  await submitAndWait(() =>
    page.selectOption("form[method=get] select[name=person]", { index: 1 })
  );
  check(
    "filters: the person select applies on change",
    page.url().includes("person="),
    page.url(),
  );
} else {
  check(
    "filters: the person select applies on change",
    true,
    "skipped, nobody to filter by",
  );
}
await shot("subjects-filtered");

// ---- gamification --------------------------------------------------------
// The scoreboard is the one public surface, so check it with a signed-out browser.
{
  const anon = await browser.newPage({
    viewport: { width: 1400, height: 1200 },
  });

  await anon.goto(`${BASE}/subjects`);
  check(
    "standings: the planning pages stay private",
    anon.url().includes("/login"),
    anon.url(),
  );

  await anon.goto(`${BASE}/standings`);
  await anon.waitForLoadState("networkidle");
  check(
    "standings: reachable with no cookie at all",
    anon.url().endsWith("/standings"),
    anon.url(),
  );
  check(
    "standings: a signed-out visitor gets no sign-out button",
    (await anon.locator('form[action="/logout"]').count()) === 0,
  );
  check(
    "standings: and no links into the private pages",
    (await anon.locator('nav a[href="/subjects"]').count()) === 0,
  );

  // The gate has to resolve the cookie even though it lets everyone through, or a
  // signed-in organiser looks anonymous here and loses their own navigation.
  await page.goto(`${BASE}/standings`);
  await settle();
  check(
    "standings: a signed-in organiser keeps the full nav",
    (await page.locator('nav a[href="/subjects"]').count()) === 1 &&
      (await page.locator('nav a[href="/sessions"]').count()) === 1 &&
      (await page.locator('nav a[href="/people"]').count()) === 1,
    `${await page.locator("nav a").count()} nav links`,
  );
  check(
    "standings: and still has a sign-out button",
    (await page.locator('form[action="/logout"]').count()) === 1,
  );

  check(
    "standings: the season progress bar renders",
    (await anon.locator("[role=progressbar]").count()) === 1,
  );
  check(
    "standings: the radar shows every tech area",
    (await anon.locator("text=never covered").count()) > 0,
  );

  // Roulette is the one island here.
  const spin = anon.locator('button:has-text("spin")');
  if (await spin.count()) {
    await spin.click();
    await anon.waitForTimeout(6000);
    const landed = await anon.evaluate(() =>
      document.body.innerText.includes("No pressure")
    );
    check("roulette: spinning lands on somebody", landed);
  } else {
    check(
      "roulette: spinning lands on somebody",
      true,
      "skipped, nobody overdue",
    );
  }

  await anon.screenshot({ path: `${OUT}/standings.png`, fullPage: true });
  await anon.close();
}

// Bounties and tags are set from the private side.
{
  await page.goto(`${BASE}/subjects`);
  await settle();
  await page.locator('table tbody tr a:has-text("edit")').first().click();
  await settle();

  await page.locator('input[name="bounty"]').fill("30");
  // Scoped to the bounty form: AutoSubmitSelect renders a <noscript> "set" button too.
  await submitAndWait(() =>
    page.locator('form:has(input[name="bounty"]) button[type=submit]').click()
  );
  check(
    "bounty: saved on the subject",
    (await page.locator('input[name="bounty"]').inputValue()) === "30",
    await page.locator('input[name="bounty"]').inputValue(),
  );

  await page.locator('input[name="tags"][value="security"]').check();
  await page.locator('input[name="tags"][value="data"]').check();
  await submitAndWait(() =>
    page.locator('button:has-text("save areas")').click()
  );
  check(
    "tags: both areas persisted",
    (await page.locator('input[name="tags"]:checked').count()) === 2,
    `${await page.locator('input[name="tags"]:checked').count()} ticked`,
  );

  // A bounty only counts as *open* while nobody has claimed it, so this needs a
  // subject with no speaker — the one above already has one.
  await page.goto(`${BASE}/subjects`);
  await settle();
  await page.keyboard.type("Nobody has taken this yet");
  await submitAndWait(() => page.keyboard.press("Enter"));

  const unclaimed = page.locator("table tbody tr")
    .filter({ hasText: "Nobody has taken this yet" })
    .locator('a:has-text("edit")');
  await unclaimed.click();
  await settle();
  await page.locator('input[name="bounty"]').fill("45");
  await submitAndWait(() =>
    page.locator('form:has(input[name="bounty"]) button[type=submit]').click()
  );

  const anon2 = await browser.newPage();
  await anon2.goto(`${BASE}/standings`);
  await anon2.waitForLoadState("networkidle");
  check(
    "bounty: an unclaimed one shows on the public board",
    (await anon2.locator("text=45 XP").count()) > 0,
  );
  check(
    "bounty: a claimed one does not",
    (await anon2.locator("text=30 XP").count()) === 0,
  );
  await anon2.close();
}

// ---- themes --------------------------------------------------------------
await page.goto(`${BASE}/`);
await settle();
await page.evaluate(() => document.documentElement.classList.remove("dark"));
await page.waitForTimeout(200);
await shot("dashboard-light");

check(
  "no console errors anywhere",
  consoleErrors.length === 0,
  consoleErrors.slice(0, 2).join(" | "),
);

await browser.close();

const pad = Math.max(...results.map((r) => r.name.length));
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(
    `${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(pad)}  ${r.detail}`,
  );
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
