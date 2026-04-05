import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MessageContentProps = {
  content: string;
};

function MessageContent({ content }: MessageContentProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
          code(props) {
            const { inline, className, children, ...rest } = props as any;

            if (inline) {
              return (
                <code className={`inline-code ${className || ""}`} {...rest}>
                  {children}
                </code>
              );
            }

            return (
              <pre className="code-block">
                <code className={className} {...rest}>
                  {children}
                </code>
              </pre>
            );
          },
          p: ({ children }) => <p className="md-p">{children}</p>,
          ul: ({ children }) => <ul className="md-ul">{children}</ul>,
          ol: ({ children }) => <ol className="md-ol">{children}</ol>,
          li: ({ children }) => <li className="md-li">{children}</li>,
          h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="md-blockquote">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table className="md-table">{children}</table>
            </div>
          ),
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}

export default MessageContent;