'use client';

import React, { useMemo } from 'react';
import { splitMentions } from '@/lib/mentions';

interface CommentBodyProps {
  body: string;
  /** Handles of everyone in the thread, so only real mentions get highlighted. */
  knownHandles?: string[];
  /** handle → actual name, so a tag renders "Abhinav Guddu" instead of the handle. */
  nameByHandle?: Record<string, string>;
}

/**
 * Renders a comment body with @mentions highlighted.
 *
 * Everything stays a React text node — the body is user input, so it is never
 * turned into HTML. The split only decides which text runs get the mention
 * colour, and the name map decides what a mention run shows.
 */
export function CommentBody({ body, knownHandles, nameByHandle }: CommentBodyProps) {
  const segments = useMemo(
    () => splitMentions(body, knownHandles, nameByHandle),
    [body, knownHandles, nameByHandle]
  );

  return (
    <p className="text-[13px] text-slate-300 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
      {segments.map((segment, i) =>
        segment.isMention ? (
          <span key={i} className="text-cyan-400 font-medium">
            {segment.display || segment.text}
          </span>
        ) : (
          <React.Fragment key={i}>{segment.text}</React.Fragment>
        )
      )}
    </p>
  );
}
