/**
 * Straat-taal: a purely cosmetic joke mode that rewrites the UI into Dutch street
 * slang, entirely in the browser.
 *
 * Only exact, known UI strings are replaced (plus a few patterns for strings with a
 * number in them), so subject titles, names and notes are left alone. The original
 * text is remembered per node, so switching it off restores the page in place.
 * A MutationObserver catches whatever the islands render later.
 *
 * Exposes `globalThis.straat = { enabled(), set(on) }` for the header toggle.
 */
(() => {
  const KEY = "sp-straat";
  const ATTRS = ["placeholder", "title", "aria-label"];

  /** Exact UI strings. Lookups also try the lower-cased string, see `lookup`. */
  const WORDS = {
    // ---- shell ----
    "session-planner": "fissa-planner",
    "session planner": "fissa planner",
    "internal talks · planning": "praatjes van de crew · planning, wollah",
    "Skip to content": "Skip die zooi, direct naar de content",
    "Sections": "Hoekjes",
    "Sign out": "Ik ben weg, doei",
    "Log in": "Ff binnenkomen",
    "Toggle theme": "Licht/donker switchen",
    "Switch to light": "Zet de lampen aan",
    "Switch to dark": "Doe maar donker, sfeer",
    "dashboard": "osso",
    "subjects": "tori's",
    "sessions": "fissa's",
    "people": "matties",
    "notes": "kladblok",
    "data": "gegevens",

    // ---- statuses & their meaning ----
    "idea": "plannetje",
    "assigned": "geclaimd",
    "planned": "ingepland",
    "presented": "gefixt",
    "archived": "in de kluis",
    "all statuses": "alles, maakt niet uit",
    "A topic with nobody on it yet — it needs a speaker.":
      "Een tori zonder eigenaar — wie pakt 'm, bro?",
    "Someone has agreed to present it, but it has no date yet.":
      "Iemand heeft 'm geclaimd, maar er staat nog geen datum. Rustig aan.",
    "Scheduled onto a session date.": "Staat vast in de agenda, strak.",
    "It happened. Add slides, a recording or notes.":
      "Is gebeurd, echt ziek. Gooi de slides, opname of notities erbij.",
    "Off your list.": "Weg ermee, niet meer jouw probleem.",

    // ---- tech areas ----
    "languages": "talen",
    "ai": "robo-brein",
    "cloud": "wolkje",
    "testing": "checken of het werkt",
    "security": "beveiliging, niemand komt erin",
    "architecture": "bouwtekening",
    "process": "gedoe",
    "tooling": "gereedschap",

    // ---- dashboard ----
    "What's coming up, and what still needs a speaker or a date.":
      "Wat eraan komt, en wat nog een spreker of datum nodig heeft, sahbi.",
    "heard a good topic? type it here…": "vette tori gehoord? gooi 'm hier…",
    "capture": "pakken",
    "— keep typing to add another.": "— ga door, gooi er nog eentje in.",
    "added": "erin gegooid:",
    "already had": "hadden we al, mattie:",
    "upcoming sessions": "fissa's die eraan komen",
    "all sessions →": "alle fissa's →",
    "No session scheduled yet.": "Nog geen fissa gepland, saai hoor.",
    "Pick a date": "Prik een datum",
    "to start planning one.": "en we gaan los.",
    "nothing planned yet — add a topic":
      "nog niks gepland — gooi er een tori in",
    "ready to schedule": "klaar om in te plannen",
    "has a speaker, needs a date": "spreker is binnen, datum nog niet",
    "scheduled on": "ingepland op",
    "schedule on…": "plan in op…",
    "no upcoming sessions — add one →": "geen fissa's in zicht — maak er een →",
    "Nothing waiting for a date. Find speakers for the ideas below.":
      "Niks wacht op een datum. Zoek sprekers voor de plannetjes hieronder.",
    "needs a speaker": "zoekt een spreker",
    "ideas nobody has picked up yet":
      "plannetjes waar nog niemand z'n naam op zet",
    "is on it — it's now under ready to schedule.":
      "gaat 'm doen, respect — staat nu bij klaar om in te plannen.",
    "assign a speaker…": "wie gaat 'm doen…",
    "No loose ideas. Capture one above.":
      "Geen losse plannetjes. Gooi er hierboven eentje in.",
    "tomorrow": "morgen al, bro",
    "today": "vandaag nog, fissa",

    // ---- subjects list ----
    "Every topic, wherever it sits on the ladder. Title, status, date and bounty are editable right here.":
      "Alle tori's, waar ze ook staan. Titel, status, datum en premie pas je hier gewoon aan, easy.",
    "Add a topic idea…": "Gooi een tori-idee erin…",
    "Add a topic idea": "Gooi een tori-idee erin",
    "add": "erin",
    "search titles and descriptions, then press enter":
      "zoek in titels en uitleg, dan enter rammen",
    "Search subjects": "Zoek tori's",
    "Filter by status": "Filter op status",
    "Filter by person": "Filter op mattie",
    "anyone": "maakt niet uit wie",
    "clear": "wegpoetsen",
    "Nothing matches. Try clearing a filter.":
      "Niks gevonden, wallah. Poets een filter weg.",
    "No subjects yet. Capture the first one above.":
      "Nog geen tori's. Gooi de eerste hierboven erin.",
    "Title": "Titel",
    "Speakers": "Sprekers",
    "Status": "Status",
    "Session": "Fissa",
    "Bounty": "Premie",
    "Extra XP for whoever presents it": "Extra XP-doekoe voor wie 'm doet",
    "edit": "fixen",
    "Open the full detail page": "Alles bekijken",
    "unscheduled": "zweeft nog",
    "Choose speakers": "Kies sprekers",
    "no speaker": "geen spreker",
    "+ add speaker": "+ spreker erbij",
    "speakers for": "sprekers voor",
    "Nobody on the list yet — type a name below, or add people on":
      "Nog niemand op de lijst — typ hieronder een naam, of zet matties op",
    "the people page": "de matties-pagina",
    "or a new name": "of een nieuwe naam",
    "(created on save)": "(komt erin bij opslaan)",
    "save": "vastzetten",
    "cancel": "laat maar",
    "unticking removes": "vinkje weg = eruit",
    "archived hidden unless you filter for it":
      "de kluis zie je alleen als je erop filtert",

    // ---- subject detail ----
    "Description": "Waar gaat het over",
    "What is it about, and why would the team care?":
      "Waar gaat het over, en waarom boeit het de crew?",
    "Links": "Linkjes",
    "+ add link": "+ linkje erbij",
    "defaults to the host name": "anders pakken we gewoon de site-naam",
    "Link label": "Naam van het linkje",
    "Link URL": "Adres van het linkje",
    "Not saved — try again": "Niet opgeslagen — nog een keer, mattie",
    "Label": "Naampje",
    "Remove link": "Linkje weg",
    "after the session": "na de fissa",
    "Slides": "Slides",
    "Recording": "Opname",
    "Notes": "Notities",
    "What came up, follow-ups, who asked what.":
      "Wat er langskwam, wat nog moet, wie wat vroeg.",
    "saved": "staat erin",
    "enter from any single-line field also saves":
      "enter rammen in een veldje slaat ook op",
    "speakers": "sprekers",
    "add a speaker…": "spreker erbij…",
    "Add a speaker": "Spreker erbij",
    "Adding the first speaker moves this to":
      "Zodra er een spreker op staat, gaat 'ie naar",
    "areas": "hoeken",
    "Areas": "Hoeken",
    "Drives the coverage radar on": "Stuurt de radar aan op",
    ". Tick what this actually covers.": ". Vink aan waar het echt over gaat.",
    "save areas": "hoeken vastzetten",
    "save speakers": "sprekers vastzetten",
    "bounty": "premie",
    "Extra XP for whoever claims this and actually presents it. Only paid out on delivery.":
      "Extra XP-doekoe voor wie 'm claimt en echt doet. Pas uitbetaald als het geleverd is, geen gezeik.",
    "Bounty in XP": "Premie in XP",
    "XP": "XP",
    "set": "zet",
    "Claimed — pays out when it moves to presented.":
      "Geclaimd — doekoe komt als 'ie gefixt is.",
    "session": "fissa",
    "No sessions yet —": "Nog geen fissa's —",
    "create one": "maak er een",
    "status": "status",
    "Idea, assigned and planned follow the speakers and the date on their own. Presented and archived stay put until you change them.":
      "Plannetje, geclaimd en ingepland regelen zichzelf. Gefixt en de kluis blijven staan tot jij iets doet.",
    "danger zone": "gevarenzone, pas op",
    "delete subject": "tori slopen",
    "yes, delete it": "ja, sloop 'm",
    "Archiving keeps the record; deleting does not.":
      "De kluis bewaart alles; slopen is echt weg, wallah.",

    // ---- sessions ----
    "The dates, and what's planned for each one.":
      "De datums, en wat er op elke fissa gebeurt.",
    "new session": "nieuwe fissa",
    "Date": "Datum",
    "Subject": "Tori",
    "(pick one, or type a new topic)": "(kies er een, of typ een nieuwe tori)",
    "what's being presented?": "wat gaan we doen dan?",
    "Speaker": "Spreker",
    "pick someone, or type a new name":
      "kies een mattie, of typ een nieuwe naam",
    "(optional)": "(hoeft niet)",
    "room, theme, catering…": "zaal, thema, bitterballen…",
    "room, theme, agenda, catering…": "zaal, thema, agenda, bitterballen…",
    "add session": "fissa erbij",
    "upcoming": "komt eraan",
    "past": "geweest",
    "No sessions scheduled. Pick a date above.":
      "Geen fissa's gepland. Prik hierboven een datum.",
    "what the team has already shared": "wat de crew al gedropt heeft",
    "Nothing yet.": "Nog niks.",
    "details": "de details",
    "Nothing planned yet. Add one from the panel on the right.":
      "Nog niks gepland. Gooi er rechts eentje in.",
    "remove from this date": "van deze datum afhalen",
    "mark presented": "is gedropt, check",
    "…or a brand new topic": "…of een gloednieuwe tori",
    "add a subject": "tori erbij",
    "pick from the pool…": "pak er een uit de bak…",
    "Add an existing subject": "Pak een bestaande tori",
    "add here": "hier erin",
    "Nothing unscheduled left in the pool.":
      "De bak is leeg, alles is ingepland.",
    "delete session": "fissa slopen",
    "Its subjects survive — they drop back to assigned or idea.":
      "De tori's overleven het — ze zakken terug naar geclaimd of plannetje.",

    // ---- people ----
    "Everyone who can present. Add colleagues up front so they're one click away when you assign a topic — or let them appear as you type names onto subjects.":
      "Iedereen die kan praten. Zet je matties er vast in, dan zijn ze één klik weg — of ze verschijnen vanzelf als je namen bij tori's typt.",
    "add a colleague…": "mattie erbij…",
    "Nobody yet. Add a few above, or they'll appear here as you assign them to subjects.":
      "Nog niemand. Gooi er hierboven een paar in, of ze komen vanzelf als je ze op tori's zet.",
    "Name": "Naam",
    "Last presented": "Laatst gedropt",
    "never": "nooit, bro",
    "merge into…": "samenvoegen met…",

    // ---- standings ----
    "Who's been sharing, what we've covered, and what's still up for grabs.":
      "Wie er gedropt heeft, wat we gehad hebben, en wat er nog te pakken valt.",
    "Earned by speakers: claim a topic 3 · get it booked 5 · present it 10 · add slides and a recording +5 · plus any bounty.":
      "Verdiend door sprekers: tori claimen 3 · ingepland 5 · gedropt 10 · slides en opname erbij +5 · plus de premie.",
    "the trophy": "de beker",
    "leaderboard": "de ranglijst",
    "Nothing scored yet. Present something.":
      "Nog niemand gescoord. Drop iets!",
    "Talks": "Praatjes",
    "Archived": "In de kluis",
    "coverage": "wat we gehad hebben",
    "dark cells are gaps — pick one": "donkere vakjes zijn gaten — pak er een",
    "never covered": "nooit gehad",
    "bounties": "premies",
    "unclaimed topics with XP on them": "tori's met doekoe erop, nog vrij",
    "No bounties up right now.": "Geen premies nu. Skeer.",
    "Claim it and it's yours.": "Claim 'm en hij is van jou, simpel.",
    "roulette": "rad van de fissa",
    "nobody who presented in the last 6 months":
      "iedereen die al een half jaar niks gedropt heeft",
    "who's next?": "wie is de volgende?",
    "in the pool": "in de bak",
    // PeoplePicker renders its create row as `+ add “`, the name, `”`.
    "+ add “": "+ gooi erin: “",
    "spin": "draaien",
    "spin again": "nog een keer draaien",
    "spinning…": "draait, draait…",
    "never presented": "nog nooit gedropt",
    ". No pressure.": ". Geen druk hoor.",
    "Everybody has presented in the last six months. Genuinely impressive.":
      "Iedereen heeft het afgelopen half jaar gedropt. Echt ziek, respect.",
    "Scores are recomputed from the schedule every time this page loads — there is no stored total to argue with.":
      "Scores worden elke keer opnieuw uitgerekend — geen totaal om over te zeiken.",

    // ---- shell, current UI ----
    "Open navigation": "Menu open gooien",
    "Theme": "Sfeer",
    "◐ Light": "◐ Licht",
    "◑ Dark": "◑ Donker",
    "Straat-taal": "Straattaal",
    "session planner – dashboard": "fissa planner – osso",
    "Lanes": "Banen",
    "Copied": "gekopieerd",
    "Delete": "Slopen",
    "Remove": "Eruit",
    "Change": "Aanpassen",
    "Create": "Maken",
    "All": "Alles",
    "Time": "Tijd",
    "URL": "Adres",

    // ---- dashboard board ----
    "Capture an idea… ⏎ to add": "Gooi een plannetje erin… ⏎ en klaar",
    "Speaker (optional)": "Spreker (hoeft niet)",
    "Filter cards by title, speaker or description…":
      "Zoek kaartjes op titel, spreker of uitleg…",
    "Filter cards": "Kaartjes filteren",
    "has speaker": "spreker binnen",
    "needs a session": "zoekt een fissa",
    "on an upcoming date": "staat in de agenda",
    "the archive": "het archief, oude bangers",
    "+ speaker": "+ spreker",
    "plan →": "inplannen →",
    "add recording": "opname erbij",
    "recording ✓": "opname ✓",
    "no speaker yet": "nog geen spreker",
    "claim": "claimen",
    "I'll present it": "Ik doe 'm",
    "Your name — you'll present this one": "Je naam — jij gaat 'm droppen",
    "e.g. Jan de Vries": "bv. Jan de Vries",
    "That one couldn't be claimed: it may already have a speaker, or the name was empty.":
      "Die kon je niet claimen: iemand was je voor, of je naam was leeg, mattie.",
    "is on it — it's now under has speaker.":
      "gaat 'm doen, respect — staat nu bij spreker binnen.",
    "No upcoming session": "Geen fissa in zicht",
    "add a date →": "prik een datum →",
    "No loose ideas.": "Geen losse plannetjes.",

    // ---- subjects, current UI ----
    "+ New subject": "+ Nieuwe tori",
    "Filter by stage": "Filter op fase",
    "Search title, description, speaker, link…":
      "Zoek op titel, uitleg, spreker, linkje…",
    "Title of the new subject…": "Titel van de nieuwe tori…",
    "No subjects yet. Add the first one with + New subject.":
      "Nog geen tori's. Gooi de eerste erin met + Nieuwe tori.",
    "Nothing matches. Clear the search or the stage filter.":
      "Niks gevonden, wallah. Poets de zoekterm of het fase-filter weg.",
    "links": "linkjes",
    "speaker": "spreker",
    "stage": "fase",
    "title": "titel",
    "the backlog and the archive.": "de bak en de kluis.",
    "↑↓ move · ⏎ open · / focus search · esc clear":
      "↑↓ schuiven · ⏎ openen · / zoeken · esc wegpoetsen",
    "Added": "Erin gegooid:",
    "Already had": "Hadden we al:",
    "Captured": "Erin gegooid",
    "History": "Geschiedenis",
    "Last edit": "Laatst aangepast",
    "Stage changed": "Fase veranderd",
    "Stage": "Fase",
    "Move it": "Verschuiven",
    "Plan it": "Inplannen",
    "Add a date": "Prik een datum",
    "Add a speaker on the left. You can already pick a date.":
      "Zet links een spreker erop. Een datum prikken kan al.",
    "No sessions yet.": "Nog geen fissa's.",
    "Delete subject…": "Tori slopen…",
    "▶ Recording": "▶ Opname",
    "⏎ save": "⏎ vastzetten",
    "↑↓ pick · ⏎ add · ⌫ on empty removes the last · esc close":
      "↑↓ kiezen · ⏎ erin · ⌫ op leeg haalt de laatste weg · esc dicht",
    "Next step: find a speaker": "Volgende stap: zoek een spreker",
    "Next step: put it on a date": "Volgende stap: prik een datum",
    "Next step: present it": "Volgende stap: droppen die handel",
    "Done: it was presented": "Klaar: is gedropt, respect",

    // ---- sessions, current UI ----
    "+ Session": "+ Fissa",
    "+ open slot": "+ plek vrij",
    "nothing presented": "niks gedropt",
    "took place": "is geweest",
    "(new topic — who's presenting it?)":
      "(nieuwe tori — wie gaat 'm droppen?)",
    "Add subject": "Tori erbij",
    "Copy agenda as text": "Agenda als tekst kopiëren",
    "Show agenda text": "Agenda als tekst",
    "Download .ics": "In je agenda (.ics)",
    "Delete session…": "Fissa slopen…",
    "Its subjects survive and go back to the backlog.":
      "De tori's overleven het en gaan terug in de bak.",
    "Move earlier": "Naar voren",
    "Move later": "Naar achteren",
    "Up": "Op",
    "Down": "Neer",
    "Session date": "Datum van de fissa",
    "Session notes": "Notities van de fissa",
    "Start time": "Begintijd",
    "Nothing planned yet. Add one below.":
      "Nog niks gepland. Gooi er hieronder eentje in.",
    "Nothing unscheduled left in the backlog; type a title to create one.":
      "De bak is leeg; typ een titel voor een nieuwe tori.",
    "Paste a recording link per subject.": "Plak per tori een opname-linkje.",
    "Find a subject, or type a new one…": "Zoek een tori, of typ een nieuwe…",

    // ---- people, current UI ----
    "Filter by name…": "Filter op naam…",
    "Filter people": "Matties filteren",
    "Merging folds one person into another and moves their subjects across. Only someone with no subjects can be deleted.":
      "Samenvoegen gooit twee matties op één hoop, hun tori's gaan mee. Alleen wie geen tori's heeft kan eruit.",
    "everyone who presents or might.":
      "iedereen die dropt of misschien gaat droppen.",
    "DUPLICATE?": "DUBBEL?",
    "Same person, different spellings": "Zelfde mattie, andere spelling",
    "Merge": "Samenvoegen",
    "Nobody matches that name.": "Niemand met die naam, bro.",
    "Nobody yet. Add a few above, or they'll appear as you put speakers on subjects.":
      "Nog niemand. Gooi er hierboven een paar in, of ze komen vanzelf als je sprekers op tori's zet.",

    // ---- notes ----
    "Private scratch space. Notes never link to subjects or sessions.":
      "Je eigen kladblok. Notities hangen nooit aan tori's of fissa's.",
    "Write whatever comes to mind…": "Gooi eruit wat er in je hoofd zit…",
    "Save note": "Vastzetten",
    "ctrl+⏎ to save": "ctrl+⏎ om vast te zetten",
    "New note": "Nieuwe notitie",
    "Note": "Notitie",
    "No notes yet. Start typing above.":
      "Nog geen notities. Begin hierboven te typen.",
    "● unsaved": "● nog niet vast",

    // ---- data ----
    "Export": "Exporteren",
    "Import": "Importeren",
    "Download JSON": "JSON downloaden",
    "Download a complete backup, or restore one from another instance.":
      "Download een complete backup, of zet er een terug van een andere plek.",
    "· includes notes": "· inclusief notities",
    "Backup file": "Backup-bestand",
    "Backup imported.": "Backup staat erin, strak.",
    "Choose a backup file first": "Kies eerst een backup-bestand, mattie",
    "Importing backup…": "Backup gaat erin…",
    "Importing deletes every subject, session, person and note here and puts the file's in their place. Export first if you might want to undo it.":
      "Importeren sloopt elke tori, fissa, mattie en notitie hier en zet die uit het bestand ervoor in de plaats. Exporteer eerst als je misschien terug wilt.",
    "REPLACES EVERYTHING": "VERVANGT ALLES",
    "Replace all data": "Alles vervangen",
    // The word to type ("replace") stays English: the server checks for it.
    "Type": "Typ",
    "to confirm": "om te bevestigen",
    "Will be deleted": "Wordt gesloopt",
    "In file": "In het bestand",
    "not a SessionPlanner backup": "geen SessionPlanner-backup, nep",

    // ---- login ----
    "PRIVATE": "PRIVÉ",
    "Password, please": "Wachtwoord, graag",
    "Everything except the dashboard is behind one shared password. You'll go back to":
      "Alles behalve de osso zit achter één gedeeld wachtwoord. Daarna ga je terug naar",
    "afterwards.": ".",
    "Sign in ⏎": "Kom binnen ⏎",
    "Signing in…": "Even binnenkomen…",
    "← Public dashboard": "← Openbare osso",
    "sign in": "kom binnen",
    "Password": "Wachtwoord",
    "that password isn't right.": "dat wachtwoord klopt niet, mattie.",
  };

  /** Strings with numbers or names in them. The whole string must match. */
  const PATTERNS = [
    [/^(\d+) subjects?$/, (n) => `${n} tori${n === "1" ? "" : "'s"}`],
    [
      /^(\d+) subjects? planned\.$/,
      (n) => `${n} tori${n === "1" ? "" : "'s"} ingepland, strak.`,
    ],
    [
      /^(\d+) subjects? · archived hidden unless you filter for it$/,
      (n) =>
        `${n} tori${
          n === "1" ? "" : "'s"
        } · de kluis zie je alleen als je erop filtert`,
    ],
    [/^(\d+) talks?$/, (n) => `${n} praatje${n === "1" ? "" : "s"}`],
    [
      /^(\d+) talks? · (\d+) coming$/,
      (n, c) => `${n} praatje${n === "1" ? "" : "s"} · ${c} op komst`,
    ],
    [
      /^(\d+) talks? · (\d+) speakers?$/,
      (n, s) =>
        `${n} praatje${n === "1" ? "" : "s"} · ${s} spreker${
          s === "1" ? "" : "s"
        }`,
    ],
    [
      /^(\d+) talks? · (\d+) XP in (.+)$/,
      (n, xp, q) =>
        `${n} praatje${n === "1" ? "" : "s"} · ${xp} XP gescoord in ${q}`,
    ],
    [/^never covered · (\d+) coming$/, (c) => `nooit gehad · ${c} op komst`],
    [/^(\d+) XP$/, (n) => `${n} XP doekoe`],
    [/^\+(\d+) bounty$/, (n) => `+${n} premie`],
    [/^(\d+) in the pool$/, (n) => `${n} in de bak`],
    [/^in (\d+) days$/, (n) => `over ${n} dagen, rustig`],
    [
      /^in (\d+) weeks?$/,
      (n) => `over ${n} ${n === "1" ? "week" : "weken"}, geen stress`,
    ],
    [
      /^(·\s)?(\d+) months ago$/,
      (dot, n) => `${dot ?? ""}${n} maanden geleden, lang hoor`,
    ],
    [/^· never presented$/, () => "· nog nooit gedropt"],
    [/^last (.+)$/, (t) => `laatst: ${d(t)}`],
    [/^season (.+)$/, (q) => `seizoen ${q}, let's go`],
    [
      /^Season progress: (\d+) of (\d+) XP$/,
      (a, b) => `Seizoen: ${a} van ${b} XP`,
    ],
    [/^target (\d+)$/, (n) => `doel: ${n}`],
    [/^champion of (.+)$/, (q) => `baas van ${q}`],
    [
      /^Holds the trophy until (.+) is beaten\.$/,
      (q) => `Houdt de beker vast tot ${q} verslagen is.`,
    ],
    [
      /^No talks in (.+) — the trophy is unclaimed\. First one to present takes it\.$/,
      (q) =>
        `Geen praatjes in ${q} — de beker staat nog te wachten. Wie het eerst dropt, pakt 'm.`,
    ],
    [
      /^rolling 12 months · since (.+)$/,
      (t) => `laatste 12 maanden · sinds ${d(t)}`,
    ],
    [
      /^Running the board earns nothing — (\d+) ideas? captured this season, which is admin, not a score\.$/,
      (n) =>
        `Het bord bijhouden levert niks op — ${n} plannetje${
          n === "1" ? "" : "s"
        } gepakt dit seizoen, dat is admin, geen score.`,
    ],
    [
      /^(\d+) (?:people|person) · merging folds one into another and moves their subjects across\.$/,
      (n) =>
        `${n} mattie${
          n === "1" ? "" : "s"
        } · samenvoegen gooit er twee op één hoop, tori's gaan mee.`,
    ],
    [/^new topic: “(.+)”$/, (t) => `nieuwe tori: “${t}”`],
    [/^new person: “(.+)”$/, (t) => `nieuwe mattie: “${t}”`],
    [/^\+ add “(.+)”$/, (t) => `+ “${t}” erbij`],
    [/^(\d+) sessions?$/, (n) => `${n} fissa${n === "1" ? "" : "'s"}`],
    [/^(\d+) (?:people|person)$/, (n) => `${n} mattie${n === "1" ? "" : "s"}`],
    [/^(\d+) notes?$/, (n) => `${n} notitie${n === "1" ? "" : "s"}`],
    [/^(\d+) presented$/, (n) => `${n} gedropt`],
    [/^(\d+) upcoming$/, (n) => `${n} op komst`],
    [/^(\d+) past$/, (n) => `${n} geweest`],
    [/^(\d+) total$/, (n) => `${n} totaal`],
    [
      /^(\d+) of (\d+) slots( filled)?$/,
      (a, b, filled) => `${a} van ${b} plekken${filled ? " bezet" : ""}`,
    ],
    [
      /^(\d+)\/(\d+) recordings (.)$/,
      (a, b, mark) => `${a}/${b} opnames ${mark}`,
    ],
    [
      /^(\d+) unscheduled in the backlog, speaker-ready first\.$/,
      (n) => `${n} in de bak, die met spreker eerst.`,
    ],
    [
      /^Keeps the selected spelling\. All (\d+) subjects? move to it\.$/,
      (n) => `De gekozen spelling blijft. Alle ${n} tori's gaan mee.`,
    ],
    [/^Next · #(\d+) (.+)$/, (n, t) => `Volgende · #${n} ${w(t)}`],
    [/^#(\d+) · (.+)$/, (n, t) => `#${n} · ${w(t)}`],
    [/^(.+) — (\d+) open$/, (t, n) => `${w(t)} — ${n} vrij`],
    [/^Plan on #(\d+), (.+)$/, (n, t) => `Plan in op #${n}, ${w(t)}`],
    [/^✓ (.+)$/, (t) => `✓ ${w(t)}`],
    // Lane tabs render as `label (`, the count, `)`.
    [/^(.+) \($/, (t) => `${w(t)} (`],
    [/^Nothing here matches “(.+)”\.$/, (q) => `Niks hier past bij “${q}”.`],
    [/^New speaker “(.+)”$/, (t) => `Nieuwe spreker “${t}”`],
    [
      /^Create “(.+)” as a new subject on #(\d+)$/,
      (t, n) => `Maak “${t}” als nieuwe tori op #${n}`,
    ],
    // aria-labels and titles that carry a subject title or a name
    [/^Move earlier: (.+)$/, (t) => `Naar voren: ${t}`],
    [/^Move later: (.+)$/, (t) => `Naar achteren: ${t}`],
    [/^Rename (.+)$/, (p) => `${p} hernoemen`],
    [/^Bounty for (.+), in XP$/, (t) => `Premie voor ${t}, in XP`],
    [/^Schedule (.+) on a session$/, (t) => `Plan ${t} in op een fissa`],
    [/^Speakers for (.+)$/, (t) => `Sprekers voor ${t}`],
    [
      /^Change speakers for (.+) \(currently (.+)\)$/,
      (t, p) => `Andere sprekers voor ${t} (nu: ${p})`,
    ],
    [/^Change speakers for (.+)$/, (t) => `Andere sprekers voor ${t}`],
    [
      /^Merge (.+) into someone else$/,
      (p) => `${p} samenvoegen met een andere mattie`,
    ],
    [/^Remove (.+)$/, (p) => `${p} eruit`],
  ];

  const DAYS = {
    Monday: "maandag",
    Tuesday: "dinsdag",
    Wednesday: "woensdag",
    Thursday: "donderdag",
    Friday: "vrijdag",
    Saturday: "zaterdag",
    Sunday: "zondag",
    Mon: "ma",
    Tue: "di",
    Wed: "wo",
    Thu: "do",
    Fri: "vr",
    Sat: "za",
    Sun: "zo",
  };
  const MONTHS = {
    January: "januari",
    February: "februari",
    March: "maart",
    April: "april",
    May: "mei",
    June: "juni",
    July: "juli",
    August: "augustus",
    September: "september",
    October: "oktober",
    November: "november",
    December: "december",
    Jan: "jan",
    Feb: "feb",
    Mar: "mrt",
    Apr: "apr",
    Jun: "jun",
    Jul: "jul",
    Aug: "aug",
    Sep: "sep",
    Sept: "sep",
    Oct: "okt",
    Nov: "nov",
    Dec: "dec",
  };
  // en-GB dates as the server formats them: "Thu 1 Oct", "Thursday, 1 October
  // 2026", "Sept 2026", "Thu 1 Oct, 16:00".
  const DATE =
    /^(?:(?<day>[A-Z][a-z]+),? )?(?:(?<num>\d{1,2}) )?(?<month>[A-Z][a-z]+)(?: (?<year>\d{4}))?(?:, (?<time>\d{2}:\d{2}))?$/;

  /** Dutch for a date string, or null if it isn't one. */
  function date(text) {
    const found = text.match(DATE)?.groups;
    if (!found || !isDate(found)) return null;
    const { day, num, month, year, time } = found;
    // DAYS[undefined] is undefined too, so a date without a weekday drops it.
    const dutch = [DAYS[day], num, MONTHS[month], year].filter(Boolean)
      .join(" ");
    return time ? `${dutch}, ${time}` : dutch;
  }

  /** A real month, a real weekday if any, and a day number or a year. */
  function isDate(found) {
    const knownDay = !found.day || Object.hasOwn(DAYS, found.day);
    return Object.hasOwn(MONTHS, found.month) && knownDay &&
      Boolean(found.num || found.year);
  }
  const d = (text) => date(text) ?? text;

  /** A weekday or month on its own, as on a calendar tile: "Thu", "Oct". */
  function calendarWord(text) {
    if (Object.hasOwn(DAYS, text)) return DAYS[text];
    if (Object.hasOwn(MONTHS, text)) return MONTHS[text];
    return null;
  }

  /**
   * "Thu · 16:00 · in 6 days": each part on its own, so counts and dates
   * combine freely. Null unless at least one part is known.
   */
  function parts(text) {
    const pieces = text.split(" · ");
    if (pieces.length < 2) return null;
    const known = pieces.map(lookup);
    if (known.every((p) => p === null)) return null;
    return known.map((p, i) => p ?? pieces[i]).join(" · ");
  }

  const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /** Returns the slang for one UI string, or null when it isn't one we know. */
  function lookup(text) {
    for (const step of LOOKUPS) {
      const out = step(text);
      if (out !== null) return out;
    }
    return null;
  }

  /** An exact WORDS entry, or its lower-case entry capitalised. */
  function word(text) {
    if (Object.hasOwn(WORDS, text)) return WORDS[text];
    const lower = text.toLowerCase();
    return Object.hasOwn(WORDS, lower) ? capitalise(WORDS[lower]) : null;
  }

  function pattern(text) {
    for (const [re, fn] of PATTERNS) {
      const m = text.match(re);
      if (m) return fn(...m.slice(1));
    }
    return null;
  }

  /** Tried in order; the first that knows the string wins. */
  const LOOKUPS = [word, pattern, date, calendarWord, parts];

  /** The slang for a known string, or the string itself. */
  const w = (text) => lookup(text) ?? text;

  /** Keeps the node's surrounding whitespace, so inline spacing survives. */
  function translate(raw) {
    const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2].replace(/\s+/g, " ");
    if (!core || !/[a-z]/i.test(core)) return null;
    const out = lookup(core);
    return out === null ? null : m[1] + out + m[3];
  }

  // Remembers what each node said before we touched it: node -> { src, out }.
  const texts = new WeakMap();
  const attrs = new WeakMap();
  let on = false;
  let applying = false;

  // Text inside these is content or markup, not UI copy. Attributes (a textarea's
  // placeholder, say) are still fair game unless opted out with data-no-straat.
  const skipText = (el) =>
    !el ||
    el.closest("script, style, textarea, noscript, [data-no-straat]") !== null;
  const skipAttr = (el) => el.closest("[data-no-straat]") !== null;

  function doText(node) {
    if (skipText(node.parentElement)) return;
    const rec = texts.get(node);
    if (rec && node.data === rec.out) return; // ours, already done
    const out = translate(node.data);
    if (out === null) {
      texts.delete(node);
      return;
    }
    texts.set(node, { src: node.data, out });
    node.data = out;
  }

  function doAttr(el, name) {
    if (skipAttr(el)) return;
    const value = el.getAttribute(name);
    if (value === null) return;
    const recs = attrs.get(el) ?? {};
    if (recs[name] && value === recs[name].out) return;
    const out = translate(value);
    if (out === null) {
      delete recs[name];
      return;
    }
    recs[name] = { src: value, out };
    attrs.set(el, recs);
    el.setAttribute(name, out);
  }

  function walk(root, fn) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    for (let n = walker.currentNode; n; n = walker.nextNode()) fn(n);
  }

  function apply(root) {
    applying = true;
    walk(root, (n) => {
      if (n.nodeType === Node.TEXT_NODE) doText(n);
      else for (const a of ATTRS) if (n.hasAttribute(a)) doAttr(n, a);
    });
    applying = false;
  }

  function restore() {
    applying = true;
    walk(document.body, (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const rec = texts.get(n);
        if (rec && n.data === rec.out) n.data = rec.src;
        texts.delete(n);
      } else {
        const recs = attrs.get(n);
        if (!recs) return;
        for (const [name, rec] of Object.entries(recs)) {
          if (n.getAttribute(name) === rec.out) n.setAttribute(name, rec.src);
        }
        attrs.delete(n);
      }
    });
    applying = false;
  }

  const observer = new MutationObserver((mutations) => {
    if (applying || !on) return;
    applying = true;
    for (const m of mutations) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttr(m.target, m.attributeName);
      else {
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.TEXT_NODE) doText(n);
          else if (n.nodeType === Node.ELEMENT_NODE) {
            applying = false;
            apply(n);
            applying = true;
          }
        }
      }
    }
    applying = false;
  });

  let originalTitle = document.title;

  function set(next) {
    on = next;
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch { /* private mode */ }
    document.documentElement.classList.toggle("straat", on);

    if (on) {
      originalTitle = document.title;
      document.title = translate(originalTitle) ?? originalTitle;
      apply(document.body);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRS,
      });
    } else {
      observer.disconnect();
      document.title = originalTitle;
      restore();
    }
    document.documentElement.classList.add("straat-ready");
    document.dispatchEvent(new CustomEvent("straat", { detail: on }));
  }

  globalThis.straat = { enabled: () => on, set };

  let stored = false;
  try {
    stored = localStorage.getItem(KEY) === "1";
  } catch { /* private mode */ }
  if (stored) set(true);
  document.documentElement.classList.add("straat-ready");
})();
