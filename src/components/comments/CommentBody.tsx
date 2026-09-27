'use client';

import React, { useMemo } from 'react';
import { splitMentions } from '@/lib/mentions';

interface CommentBodyProps {
  body: string;
  /** Handles of everyone in the thread, so only real mentions get highlighted. */
  knownHandles?: string[];
}

/**
 * Renders a comment body with @mentions highlighted.
 *
 * Everything stays a React text node — the body is user input, so it is never
 * turned into HTML. The split only decides which text runs get the mention
 * colour.
 */
export function CommentBody({ body, knownHandles }: CommentBodyProps) {
  const segments = useMemo(() => splitMentions(body, knownHandles), [body, knownHandles]);

  return (
    <p className="text-[13px] text-slate-300 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
      {segments.map((segment, i) =>
        segment.isMention ? (
          <span key={i} className="text-cyan-400 font-medium">
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={i}>{segment.text}</React.Fragment>
        )
      )}
    </p>
  );
}
