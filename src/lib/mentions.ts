/**
 * Pure text helpers for @mentions. No server imports on purpose, so the comment
 * component can use these in the browser bundle without dragging Supabase in.
 */

/**
 * A mention is a single space-free token. Dots, dashes and underscores are kept
 * because email local-parts (the mentionable handle) use them.
 *
 * The leading lookbehind requires a word boundary before the "@", so an email
 * address in a comment ("write to a@b.com") and a mid-word "@" are not mistaken
 * for mentions. The trailing lookahead stops a longer run of handle characters
 * from being silently truncated into a bogus handle.
 */
const MENTION_PATTERN = /(?<=^|[\s([{])@([A-Za-z0-9._-]{1,40})(?![A-Za-z0-9_-])/g;

/**
 * The mentionable name for a member. There is no profiles table and no username
 * column in this app, so the email local-part is the only identifier guaranteed
 * to exist and be unique per account. It is also the fallback the UI already
 * shows for an author with no name, so a member is reachable by the same string
 * they can see next to their comment.
 */
export function handleFromEmail(email: string): string {
  return (email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

/** Distinct handles mentioned in a body, lowercased, with trailing punctuation trimmed. */
export function extractMentionHandles(text: string): string[] {
  const out = new Set<string>();
  for (const match of (text || '').matchAll(MENTION_PATTERN)) {
    // "hi @abhinav." must resolve to "abhinav", not "abhinav.".
    const handle = match[1].replace(/[._-]+$/, '').toLowerCase();
    if (handle) out.add(handle);
  }
  return Array.from(out);
}

export interface MentionSegment {
  text: string;
  /** What to show for a mention: the member's actual name, not the @handle. */
  display?: string;
  isMention: boolean;
}

/** Normalise a handle → display-name map once, so every lookup is lowercase. */
function lookupMap(nameByHandle: Record<string, string>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [handle, name] of Object.entries(nameByHandle || {})) {
    if (handle && name) lookup.set(handle.toLowerCase(), name);
  }
  return lookup;
}

/**
 * Render stored `@handle` tokens as actual names ("Abhinav Guddu", not
 * "@abhinavguddu99"). The stored text keeps the @handle — that is what the
 * server resolves to a user id — so this is display-only, for bell excerpts
 * and push bodies. Unknown handles are left untouched.
 */
export function resolveHandleDisplayNames(
  text: string | null | undefined,
  nameByHandle: Record<string, string>
): string {
  if (!text) return '';
  const lookup = lookupMap(nameByHandle);
  if (!lookup.size) return text;

  return text.replace(new RegExp(MENTION_PATTERN.source, 'g'), (match: string, raw: string) => {
    const handle = (raw || '').replace(/[._-]+$/, '').toLowerCase();
    return lookup.get(handle) || match;
  });
}

/**
 * Split a comment body into plain and mention runs so the UI can style mentions
 * without ever calling dangerouslySetInnerHTML — comment bodies are user input
 * and are only ever rendered as React text nodes.
 */
export function splitMentions(
  body: string,
  knownHandles: string[] = [],
  nameByHandle: Record<string, string> = {}
): MentionSegment[] {
  const text = body || '';
  if (!text) return [];

  const known = new Set(knownHandles.map((h) => h.toLowerCase()));
  const names = lookupMap(nameByHandle);
  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  // A fresh regex per call: matchAll advances lastIndex, and a shared module-level
  // regex would carry that state between renders.
  for (const match of text.matchAll(new RegExp(MENTION_PATTERN.source, 'g'))) {
    const at = match.index ?? 0;
    const raw = match[1];
    const handle = raw.replace(/[._-]+$/, '').toLowerCase();

    // When the viewer has no member list loaded, style every @token. Highlighting
    // an unrecognised handle is harmless, whereas leaving a real mention
    // unstyled when the lookup is unavailable is not.
    const isMention = handle.length > 0 && (known.size === 0 || known.has(handle));
    if (!isMention) continue;

    if (at > lastIndex) {
      segments.push({ text: text.slice(lastIndex, at), isMention: false });
    }
    // Show the member's actual name; fall back to the raw token when the name
    // is unknown (deleted account, or the list has not loaded yet).
    segments.push({ text: match[0], display: names.get(handle) || match[0], isMention: true });
    lastIndex = at + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMention: false });
  }

  return segments.length ? segments : [{ text, isMention: false }];
}

/**
 * The partial handle the caret is currently sitting inside, e.g. "@ab" → "ab",
 * or null when the caret is not in a mention. Drives the autocomplete popup.
 *
 * `start` is the index where the "@" begins so the caller can replace the whole
 * token on selection.
 */
export function detectMentionQuery(
  text: string,
  caret: number
): { query: string; start: number } | null {
  const upToCaret = (text || '').slice(0, caret);

  // Anchored to the end: only offer suggestions for the token being typed, and
  // stop at whitespace so "@a hi" never looks like the handle "a hi".
  const match = /@([A-Za-z0-9._-]*)$/.exec(upToCaret);
  if (!match) return null;

  return { query: match[1].toLowerCase(), start: caret - match[1].length - 1 };
}

/** Replace the in-progress mention token with a chosen handle. */
export function applyMention(
  text: string,
  start: number,
  handle: string
): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(start).replace(/^@[A-Za-z0-9._-]*/, '');
  const next = `${before}@${handle} ${after}`;
  return { text: next, caret: before.length + handle.length + 2 };
}
