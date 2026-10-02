import type { PageProps } from "fresh";
import type { State } from "@/utils.ts";
import { asset } from "fresh/runtime";
import ThemeToggle from "@/islands/ThemeToggle.tsx";
import StraatToggle from "@/islands/StraatToggle.tsx";
import StroopwafelEgg from "@/islands/StroopwafelEgg.tsx";

export default function App(
  { Component, url, state }: PageProps<unknown, State>,
) {
  // The public dashboard has no app chrome; all other views belong to the organiser.
  const signedIn = state?.signedIn === true;

  const nav = [
    { href: "/", label: "dashboard" },
    { href: "/subjects", label: "subjects" },
    { href: "/sessions", label: "sessions" },
    { href: "/people", label: "people" },
    { href: "/data", label: "data" },
    { href: "/standings", label: "standings" },
  ];

  const active = (href: string) =>
    href === "/" ? url.pathname === "/" : url.pathname.startsWith(href);

  // The login page gets no chrome.
  const bare = url.pathname === "/login";

  return (
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
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

            {signedIn && (
              <header class="app-header sticky top-0 z-30 flex items-center gap-2 border-b border-dashed border-slate-300 bg-white/90 shadow-sm backdrop-blur md:gap-4 dark:border-slate-700 dark:bg-slate-900/90">
                <a
                  href="/"
                  class="flex min-w-0 flex-1 flex-col leading-tight no-underline md:flex-none"
                >
                  <span class="truncate font-mono text-sm font-bold tracking-tight text-slate-900 md:text-base dark:text-slate-100">
                    session-planner
                  </span>
                  <span class="hidden font-mono text-xs text-slate-600 md:block dark:text-slate-400">
                    internal talks · planning
                  </span>
                </a>

                <nav
                  class="mr-auto hidden min-w-0 gap-1 lg:flex"
                  aria-label="Sections"
                >
                  {nav.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={active(item.href) ? "page" : undefined}
                      class={`inline-flex h-9 shrink-0 items-center rounded-md px-3 font-mono text-sm font-medium no-underline transition ${
                        active(item.href)
                          ? "bg-brand text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>

                <details class="relative shrink-0 lg:hidden">
                  <summary
                    class="ui-icon-btn h-11 w-11 cursor-pointer list-none"
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
                    class="absolute right-0 top-full z-40 mt-2 flex min-w-48 flex-col gap-1 rounded-lg border border-dashed border-slate-300 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-900"
                    aria-label="Sections"
                  >
                    {nav.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        aria-current={active(item.href) ? "page" : undefined}
                        class={`flex min-h-10 items-center rounded-md px-3 font-mono text-sm font-medium no-underline transition ${
                          active(item.href)
                            ? "bg-brand text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>
                </details>

                <div class="flex shrink-0 items-center gap-1">
                  <span class="hidden lg:inline-flex">
                    <StroopwafelEgg />
                  </span>
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
