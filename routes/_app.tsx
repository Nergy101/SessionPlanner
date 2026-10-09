import type { PageProps } from "fresh";
import type { State } from "@/utils.ts";
import { asset } from "fresh/runtime";
import ThemeToggle from "@/islands/ThemeToggle.tsx";
import StraatToggle from "@/islands/StraatToggle.tsx";

const NAV = [
  { href: "/", label: "dashboard" },
  { href: "/subjects", label: "subjects" },
  { href: "/sessions", label: "sessions" },
  { href: "/people", label: "people" },
  { href: "/notes", label: "notes" },
  { href: "/data", label: "data" },
];

export default function App(
  { Component, url, state }: PageProps<unknown, State>,
) {
  // Only the dashboard is public. Other sections stay visible as locked links to /login.
  const signedIn = state?.signedIn === true;

  // The login page carries its own layout and gets no app chrome.
  const bare = url.pathname === "/login";

  const active = (href: string) =>
    href === "/" ? url.pathname === "/" : url.pathname.startsWith(href);

  const current = NAV.find((item) => active(item.href));

  const navLinks = (vertical: boolean) =>
    NAV.map((item) => {
      const isActive = active(item.href);
      const locked = !signedIn && item.href !== "/";
      const classes = [
        "nav-link",
        vertical && "nav-link-vertical",
        isActive && "nav-link-active",
        locked && "nav-link-locked",
      ].filter(Boolean).join(" ");
      return (
        <a
          key={item.href}
          href={locked
            ? `/login?returnTo=${encodeURIComponent(item.href)}`
            : item.href}
          aria-current={isActive ? "page" : undefined}
          class={classes}
        >
          {item.label}
        </a>
      );
    });

  const logo = (size: number) => (
    <span class="sp-mark" style={`--s:${size}px`} aria-hidden="true">
      <span class="sp-sq"></span>
      <span class="sp-ci"></span>
    </span>
  );

  const signOut = signedIn && (
    <form method="post" action="/logout">
      <button type="submit" class="ui-btn ui-btn-ghost" title="Sign out">
        Sign out
      </button>
    </form>
  );

  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <title>session-planner</title>
        <meta name="theme-color" content="#fff8e7" />
        <link rel="icon" href={asset("/favicon.svg")} type="image/svg+xml" />
        <link
          rel="icon"
          href={asset("/favicon-32.png")}
          sizes="32x32"
          type="image/png"
        />
        <link
          rel="apple-touch-icon"
          href={asset("/apple-touch-icon-180.png")}
        />
        <link rel="manifest" href={asset("/manifest.webmanifest")} />
        {/* Applied before first paint, so there is no flash of the other theme. */}
        <script
          // deno-lint-ignore react-no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var s=localStorage;
              var t=s.getItem('sp-theme');
              document.documentElement.setAttribute('data-theme', t==='dark'?'dark':'light');
              if(s.getItem('sp-straat')==='1'){
                document.documentElement.classList.add('straat');
                // Never leave the page hidden if straat.js fails to load.
                setTimeout(function(){document.documentElement.classList.add('straat-ready');},1500);
                }
            }catch(e){}})();`,
          }}
        />
        <script src={asset("/straat.js")} defer />
        <script src={asset("/busy.js")} defer />
        <script src={asset("/require-input.js")} defer />
      </head>
      <body>
        {bare ? <Component /> : (
          <div class="app-shell">
            <a href="#main" class="skip-link">
              Skip to content
            </a>

            <aside class="sidebar" aria-label="Sections">
              <a
                href="/"
                class="sp-logo sidebar-brand"
                aria-label="session planner – dashboard"
              >
                {logo(26)}
                <span class="sp-word">session planner</span>
              </a>

              <nav class="flex flex-col gap-1.5" aria-label="Sections">
                {navLinks(false)}
              </nav>

              <div class="sidebar-foot">
                <ThemeToggle />
                <StraatToggle />
                {signOut}
              </div>
            </aside>

            <header class="m-bar">
              <a
                href="/"
                class="sp-logo"
                aria-label="session planner – dashboard"
              >
                {logo(28)}
              </a>
              <span class="m-title">{current?.label ?? "session planner"}</span>
              <details class="m-menu">
                <summary aria-label="Open navigation" title="Open navigation">
                  ☰
                </summary>
                <div class="m-menu-panel">
                  <nav class="flex flex-col gap-2" aria-label="Sections">
                    {navLinks(true)}
                  </nav>
                  <div class="m-settings">
                    <div class="m-settings-row">
                      <span class="ui-eyebrow">Straat-taal</span>
                      <StraatToggle />
                    </div>
                    <div class="m-settings-row">
                      <span class="ui-eyebrow">Theme</span>
                      <ThemeToggle />
                    </div>
                    {signOut}
                  </div>
                </div>
              </details>
            </header>

            <main id="main" class="app-main mx-auto w-full max-w-6xl">
              <Component />
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
