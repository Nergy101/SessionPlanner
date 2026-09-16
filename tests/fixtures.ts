/**
 * Demo data for tests and visual checks.
 *
 * Deliberately NOT wired to a task that can touch the real database: the local app
 * starts empty, because a planning tool full of invented topics is worse than an
 * empty one. Point DB_PATH at a temp file and call this when you need something to
 * look at.
 */
import type { Kysely } from "@kysely/kysely";
import type { Database } from "@/db/schema.ts";
import { createSession, nextThursday } from "@/services/sessions.ts";
import {
  createSubject,
  replaceSubjectLinks,
  setSubjectBounty,
  setSubjectPeople,
  setSubjectSession,
  setSubjectStatus,
  setSubjectTags,
  updateSubjectDetails,
} from "@/services/subjects.ts";

/** Wipes every table. Child tables first, so foreign keys never block it. */
export async function clearAll(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("subject_people").execute();
  await db.deleteFrom("subject_links").execute();
  await db.deleteFrom("subjects").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("people").execute();
}

/** One subject on each rung of the ladder, so every view has something to show. */
export async function seedDemoData(db: Kysely<Database>): Promise<void> {
  await clearAll(db);

  const shift = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const upcoming = await createSession(
    nextThursday(),
    "Big room, 16:00. Pizza ordered for 25.",
  );
  const past = await createSession(
    shift(-21),
    "Went long - keep to 20 minutes next time.",
  );

  // Planned onto the upcoming session
  const testcontainers = await createSubject("Testcontainers in CI");
  await updateSubjectDetails(testcontainers, {
    title: "Testcontainers in CI",
    description:
      "Spinning up a real Postgres per test run instead of mocking the repository layer. What it cost us in pipeline minutes and why it was worth it.",
  });
  await setSubjectPeople(testcontainers, ["Jan de Vries", "Sanne Bakker"]);
  await setSubjectSession(testcontainers, upcoming);
  await replaceSubjectLinks(testcontainers, [
    { url: "https://testcontainers.com/", label: "Testcontainers" },
    { url: "https://github.com/our-org/ci-pipeline" },
  ]);

  const otel = await createSubject("OpenTelemetry end to end");
  await updateSubjectDetails(otel, {
    title: "OpenTelemetry end to end",
    description:
      "Tracing a request from the front end through three services at a customer. The gotchas nobody writes down.",
  });
  await setSubjectPeople(otel, ["Youssef el Amrani"]);
  await setSubjectSession(otel, upcoming);
  await replaceSubjectLinks(otel, [
    { url: "https://opentelemetry.io/docs/", label: "OTel docs" },
  ]);

  // Assigned: has a speaker, waiting for a date
  const cpm = await createSubject(
    "Migrating 40 projects to central package management",
  );
  await updateSubjectDetails(cpm, {
    title: "Migrating 40 projects to central package management",
    description:
      "Directory.Packages.props across a large solution, and the two weeks of dependency archaeology it took.",
  });
  await setSubjectPeople(cpm, ["Jan de Vries"]);

  const playwright = await createSubject("Playwright instead of Selenium");
  await updateSubjectDetails(playwright, {
    title: "Playwright instead of Selenium",
    description: "Why we switched at a customer, and what broke.",
  });
  await setSubjectPeople(playwright, ["Marieke Post"]);

  // Ideas: nobody on them yet
  await createSubject("Feature flags without a vendor");
  const k8s = await createSubject(
    "What we learned running Kubernetes for one small customer",
  );
  await updateSubjectDetails(k8s, {
    title: "What we learned running Kubernetes for one small customer",
    description: "Spoiler: we stopped.",
  });

  // Presented, on the past session
  const srcgen = await createSubject("Source generators in anger");
  await updateSubjectDetails(srcgen, {
    title: "Source generators in anger",
    description: "Replacing reflection-heavy mapping code at a customer.",
    slidesUrl: "https://example.com/slides/source-generators",
    recapNotes:
      "Lots of questions about debuggability. Follow-up session requested.",
  });
  await setSubjectPeople(srcgen, ["Sanne Bakker"]);
  await setSubjectSession(srcgen, past);
  await setSubjectStatus(srcgen, "presented");

  // ---- history, so the scoreboard has something to show --------------------
  const monthsBack = (n: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
  };

  await setSubjectTags(testcontainers, ["testing", "devops"]);
  await setSubjectTags(otel, ["cloud", "architecture"]);
  await setSubjectTags(cpm, ["tooling"]);
  await setSubjectTags(srcgen, ["languages", "tooling"]);

  // A bounty nobody has claimed yet.
  await setSubjectBounty(k8s, 25);
  await setSubjectTags(k8s, ["cloud", "devops"]);

  // Past talks across two quarters, so the trophy and the rolling window differ.
  const history = [
    {
      title: "Rust for people who like C#",
      who: ["Jan de Vries"],
      back: 2,
      tags: ["languages"],
      archived: true,
    },
    {
      title: "Blue/green without downtime",
      who: ["Youssef el Amrani"],
      back: 4,
      tags: ["devops", "cloud"],
      archived: false,
    },
    {
      title: "Threat modelling a sprint",
      who: ["Marieke Post"],
      back: 5,
      tags: ["security"],
      archived: true,
    },
    {
      title: "Vector search in Postgres",
      who: ["Sanne Bakker", "Jan de Vries"],
      back: 7,
      tags: ["data", "ai"],
      archived: true,
    },
    {
      title: "Design tokens end to end",
      who: ["Marieke Post"],
      back: 9,
      tags: ["frontend"],
      archived: false,
    },
  ];

  for (const t of history) {
    const id = await createSubject(t.title);
    await setSubjectPeople(id, t.who);
    await setSubjectTags(id, t.tags);
    const s = await createSession(monthsBack(t.back));
    await setSubjectSession(id, s);
    if (t.archived) {
      await updateSubjectDetails(id, {
        title: t.title,
        slidesUrl: "https://example.com/slides",
        recordingUrl: "https://example.com/recording",
      });
    }
    await setSubjectStatus(id, "presented");
  }

  // Someone who has not presented in a long time, for the roulette pool.
  const stale = await createSubject("Legacy Perl, a retrospective");
  await setSubjectPeople(stale, ["Bram Wolters"]);
  const staleSession = await createSession(monthsBack(20));
  await setSubjectSession(stale, staleSession);
  await setSubjectStatus(stale, "presented");
}
