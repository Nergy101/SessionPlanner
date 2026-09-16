import type { PageProps } from "fresh";
import type { State } from "@/utils.ts";
import { asset } from "fresh/runtime";
import ThemeToggle from "@/islands/ThemeToggle.tsx";
import StraatToggle from "@/islands/StraatToggle.tsx";
import StroopwafelEgg from "@/islands/StroopwafelEgg.tsx";

export default function App(
  { Component, url, state }: PageProps<unknown, State>,
) {
  // /standings is public, so a visitor may have no session at all. Show them the
  // scoreboard and nothing else — the planning pages are the organiser's.
  const signedIn = state?.signedIn === true;

  const nav = signedIn
    ? [
      { href: "/", label: "dashboard" },
      { href: "/subjects", label: "subjects" },
      { href: "/sessions", label: "sessions" },
      { href: "/people", label: "people" },
      { href: "/standings", label: "standings" },
    ]
    : [{ href: "/standings", label: "standings" }];

  const active = (href: string) =>
    href === "/" ? url.pathname === "/" : url.pathname.startsWith(href);

  // The login page gets no chrome.
  const bare = url.pathname === "/login";

  return (
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>session-planner</title>
        <link rel="icon" href={asset("/favicon.ico")} />
        {/* Applied before first paint, so there is no flash of the other theme. */}
        <script
          // deno-lint-ignore react-no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var s=localStorage;
              // Carry settings over from the old KnowledgeSessions "ks-" keys.
              ['theme','straat'].forEach(function(k){
                var old=s.getItem('ks-'+k);
                if(old===null) return;
                if(s.getItem('sp-'+k)===null) s.setItem('sp-'+k, old);
                s.removeItem('ks-'+k);
              });
              s.removeItem('ks-crt');
              var t=s.getItem('sp-theme');
              document.documentElement.classList.toggle('dark', t===null?true:t==='1');
              if(s.getItem('sp-straat')==='1'){
                document.documentElement.classList.add('straat');
                // Never leave the page hidden if straat.js fails to load.
                setTimeout(function(){document.documentElement.classList.add('straat-ready');},1500);
              }
            }catch(e){}})();`,
          }}
        />
        <script src={asset("/straat.js")} defer />
      </head>
      <body>
        {bare ? <Component /> : (
          <div class="flex min-h-full flex-col">
            <a
              href="#main"
              class="sr-only rounded-md bg-brand px-3 py-2 font-mono text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50"
            >
              Skip to content
            </a>

            <header class="sticky top-0 z-30 flex items-center gap-2 border-b border-dashed border-slate-300 bg-white/90 px-3 py-3 shadow-sm backdrop-blur sm:gap-6 sm:px-6 dark:border-slate-700 dark:bg-slate-900/90">
              <a
                href="/"
                class="flex min-w-0 flex-col leading-tight no-underline"
              >
                <span class="truncate font-mono text-sm font-bold tracking-tight text-slate-900 sm:text-base dark:text-slate-100">
                  session-planner
                </span>
                <span class="hidden font-mono text-xs text-slate-600 sm:block dark:text-slate-400">
                  internal talks · planning
                </span>
              </a>

              <nav
                class="mr-auto flex min-w-0 gap-0.5 sm:gap-1"
                aria-label="Sections"
              >
                {nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    aria-current={active(item.href) ? "page" : undefined}
                    class={`inline-flex h-9 shrink-0 items-center rounded-md px-1.5 font-mono text-sm font-medium no-underline transition sm:px-3 ${
                      active(item.href)
                        ? "bg-brand text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              <div class="flex items-center gap-1">
                <StroopwafelEgg />
                <StraatToggle />
                <ThemeToggle />
                {signedIn && (
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
                )}
              </div>
            </header>

            <main
              id="main"
              class="mx-auto w-full max-w-6xl flex-1 px-4 py-7 pb-16 sm:px-6"
            >
              <Component />
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
