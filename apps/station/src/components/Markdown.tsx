import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Headings in a message are styled text, not document headings: a crew member's `# Plan` must not
 * break the page's heading outline.
 */
const heading = (size: string) =>
  function Heading({ children }: { readonly children?: React.ReactNode }) {
    return (
      <p className={`m-0 font-display font-normal text-panel-title uppercase ${size}`}>
        {children}
      </p>
    );
  };

const components: Components = {
  p: ({ children }) => <p className="m-0">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="text-fg-hi">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  ul: ({ children }) => <ul className="m-0 flex list-disc flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="m-0 flex flex-col gap-1 border-line-soft border-l-2 pl-2.5 text-fg-soft">
      {children}
    </blockquote>
  ),
  code: ({ children }) => <code className="bg-well px-1 text-cyan">{children}</code>,
  pre: ({ children }) => (
    <pre className="m-0 overflow-x-auto border border-line-faint bg-well p-2 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-fg">
      {children}
    </pre>
  ),
  // Never fetched (a remote image is a tracking pixel): its alt text stands in for it.
  img: ({ alt }) => <span className="text-fg-mute">[{alt || "image"}]</span>,
  hr: () => <hr className="m-0 h-0.5 border-0 bg-line-faint" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line-faint px-2 py-1 font-normal text-fg-hi">{children}</th>
  ),
  td: ({ children }) => <td className="border border-line-faint px-2 py-1">{children}</td>,
  h1: heading("text-d10"),
  h2: heading("text-d9"),
  h3: heading("text-d8"),
  h4: heading("text-d7"),
  h5: heading("text-d7"),
  h6: heading("text-d7"),
};

/**
 * Text that may carry Markdown (a crew member's reply, a report, a notification), drawn with the
 * station's tokens. It is untrusted model output: raw HTML is skipped, images are dropped to their
 * alt text (no remote fetches), and links open in a new tab without access to this one.
 */
export function Markdown({
  text,
  className = "",
}: {
  readonly text: string;
  readonly className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 [overflow-wrap:anywhere] ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** A preview's longest unbroken run (a URL, a hash); longer runs are cut with an ellipsis. */
const MAX_RUN = 48;

/**
 * One line of plain text from Markdown, for previews: marks and line breaks removed, and any run
 * longer than 48 characters cut short, so a pasted URL cannot push a preview off its line.
 */
export function plainText(markdown: string): string {
  return (
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
      .replace(/[*~`]+/g, "")
      // Underscores only as emphasis marks (at a word's edge): `write_file` keeps its own.
      .replace(/(^|[\s(])_+(?=\S)|(?<=\S)_+(?=$|[\s.,;:!?)])/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\S+/g, (run) => (run.length > MAX_RUN ? `${run.slice(0, MAX_RUN - 1)}…` : run))
  );
}
