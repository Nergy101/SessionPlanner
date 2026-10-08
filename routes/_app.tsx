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
  // The public dashboard has no app chrome; all other views belong to the organiser.
  const signedIn = state?.signedIn === true;

  const active = (href: string) =>
    href === "/" ? url.pathname === "/" : url.pathname.startsWith(href);

  // The login page gets no chrome.
  const bare = url.pathname === "/login";

  const navLinks = (vertical: boolean) =>
    NAV.map((item) => (
      <a
        key={item.href}
        href={item.href}
        aria-current={active(item.href) ? "page" : undefined}
        class={`nav-link${vertical ? " nav-link-vertical" : ""}${
          active(item.href) ? " nav-link-active" : ""
        }`}
      >
        {item.label}
      </a>
    ));

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
      </head>
      <body>
        {bare ? <Component /> : (
          <div class="flex min-h-full flex-col">
            <a href="#main" class="skip-link">
              Skip to content
            </a>

            {signedIn && (
              <header class="app-header sticky top-0 z-30 flex items-center gap-3 border-b-2 border-(--color-line) bg-(--color-surface)">
                <a
                  href="/"
                  class="sp-logo"
                  aria-label="session planner – dashboard"
                >
                  <span class="sp-mark" style="--s:28px" aria-hidden="true">
                    <span class="sp-sq"></span>
                    <span class="sp-ci"></span>
                  </span>
                  <span class="sp-word">session planner</span>
                </a>

                <nav
                  class="hidden min-w-0 flex-1 items-center gap-1 lg:flex"
                  aria-label="Sections"
                >
                  {navLinks(false)}
                </nav>

                <details class="relative ml-auto shrink-0 lg:hidden">
                  <summary
                    class="ui-icon-btn cursor-pointer list-none"
                    aria-label="Open section navigation"
                    title="Open navigation"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      aria-hidden="true"
                    >
                      <line x1="4" y1="6" x2="20" y2="6" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="18" x2="20" y2="18" />
                    </svg>
                  </summary>
                  <nav
                    class="absolute right-0 top-full z-40 mt-2 flex min-w-48 flex-col gap-1 rounded-(--radius-lg) border-2 border-(--color-line) bg-(--color-surface) p-2 shadow-(--shadow-lg)"
                    aria-label="Sections"
                  >
                    {navLinks(true)}
                  </nav>
                </details>

                <div class="flex shrink-0 items-center gap-1">
                  <span class="hidden lg:inline-flex">
                    <StraatToggle />
                  </span>
                  <ThemeToggle />
                  <form method="post" action="/logout">
                    <button
                      type="submit"
                      class="ui-icon-btn"
                      title="Sign out"
                      aria-label="Sign out"
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </button>
                  </form>
                </div>
              </header>
            )}

            <main
              id="main"
              class={`app-main mx-auto w-full max-w-6xl flex-1 ${
                signedIn ? "" : "app-main-public"
              }`}
            >
              <Component />
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
