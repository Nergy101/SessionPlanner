import { getCookies, setCookie } from "@std/http/cookie";

/**
 * There is one user, so this is a privacy gate rather than an identity system:
 * one shared password from the environment, no user table, no registration.
 *
 * The cookie holds an HMAC of the password rather than the password itself, so a
 * stolen cookie can't be read back into the secret, and rotating APP_PASSWORD
 * invalidates every existing session automatically.
 */
const COOKIE = "sp_auth";

export function requiredPassword(): string {
  const password = Deno.env.get("APP_PASSWORD");
  if (!password) {
    // Fail loudly rather than silently serving an open app onto the network.
    throw new Error(
      "APP_PASSWORD is not set. Set it before starting the app " +
        "(docker compose reads it from .env).",
    );
  }
  return password;
}

async function token(): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredPassword()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("session-planner-v1"),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Constant-time compare, so a wrong password leaks nothing through timing. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isSignedIn(req: Request): Promise<boolean> {
  const cookie = getCookies(req.headers)[COOKIE];
  if (!cookie) return false;
  return equals(cookie, await token());
}

export function checkPassword(supplied: string): boolean {
  return equals(supplied, requiredPassword());
}

export async function signInHeaders(secure: boolean): Promise<Headers> {
  const headers = new Headers();
  setCookie(headers, {
    name: COOKIE,
    value: await token(),
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure,
    maxAge: 60 * 60 * 24 * 90, // sign in once per device and forget it exists
  });
  return headers;
}

export function signOutHeaders(): Headers {
  const headers = new Headers();
  setCookie(headers, {
    name: COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    maxAge: 0,
  });
  return headers;
}

/** Only ever redirect to a local path — never to an attacker-supplied host. */
export function safeReturnTo(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}
