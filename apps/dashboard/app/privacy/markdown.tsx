import { Fragment, type ReactNode } from 'react';

/**
 * A deliberately small Markdown renderer for the privacy policy.
 *
 * The policy is authored in `PRIVACY_POLICY.md` at the repo root and stays the
 * single source of truth — a legal document should not be maintained in two
 * places. Rather than pull in a full Markdown dependency for one static page,
 * this handles exactly the constructs that document uses: h1–h3, paragraphs,
 * `---` rules, single-level `-` lists, and inline `**bold**` / `_italic_`.
 *
 * If the policy ever grows links, tables, nested lists or code, swap this for a
 * real parser rather than extending it — that is the point at which hand-rolling
 * stops being the cheaper option.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Split on **bold** and _italic_ in one pass so they can sit side by side.
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  parts.forEach((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push(<strong key={key}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      out.push(<em key={key}>{part.slice(1, -1)}</em>);
    } else if (part) {
      out.push(<Fragment key={key}>{part}</Fragment>);
    }
  });
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split('\n');
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const key = `p-${blocks.length}`;
    blocks.push(<p key={key}>{inline(paragraph.join(' '), key)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const key = `ul-${blocks.length}`;
    blocks.push(
      <ul key={key}>
        {list.map((item, i) => (
          <li key={`${key}-${i}`}>{inline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushAll();
      continue;
    }
    if (line.startsWith('### ')) {
      flushAll();
      blocks.push(<h3 key={`h3-${blocks.length}`}>{inline(line.slice(4), `h3-${blocks.length}`)}</h3>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushAll();
      blocks.push(<h2 key={`h2-${blocks.length}`}>{inline(line.slice(3), `h2-${blocks.length}`)}</h2>);
      continue;
    }
    if (line.startsWith('# ')) {
      flushAll();
      blocks.push(<h1 key={`h1-${blocks.length}`}>{inline(line.slice(2), `h1-${blocks.length}`)}</h1>);
      continue;
    }
    if (line.trim() === '---') {
      flushAll();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      list.push(line.slice(2));
      continue;
    }
    // Anything else continues the current paragraph. A list is closed first, so
    // prose following a list starts its own block rather than joining an item.
    flushList();
    paragraph.push(line.trim());
  }
  flushAll();

  return <>{blocks}</>;
}
