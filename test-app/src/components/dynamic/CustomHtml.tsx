import { useRef, useEffect, useState } from "react";

interface Props {
  data: {
    html?: string;
  };
}

/**
 * Renders arbitrary HTML/CSS from Claude inside a sandboxed iframe.
 *
 * Security: sandbox="allow-scripts allow-same-origin" lets JS run with
 * same-origin access (needed for tab switching, hash navigation, computed
 * styles, etc.) while still preventing:
 *   - Form submission
 *   - Top-level navigation
 *   - Popups
 *
 * Auto-resizes to match content height via postMessage.
 */
export function CustomHtml({ data }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const html = data.html ?? "";

  // Wrap in a full document with base styles + resize script
  const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #333;
    background: #fff;
  }
</style>
</head>
<body>
${html}
<script>
  function sendHeight() {
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'iframe-resize', height: h }, '*');
  }
  sendHeight();
  new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
  window.addEventListener('load', sendHeight);
  window.addEventListener('resize', sendHeight);
</script>
</body>
</html>`;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "iframe-resize" && typeof e.data.height === "number") {
        // Only accept messages from our iframe
        if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
          setHeight(Math.max(100, Math.min(2000, e.data.height)));
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!html) {
    return <div style={{ padding: 16, color: "#999", fontSize: 13 }}>No HTML content provided.</div>;
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: "100%",
        height,
        border: "none",
        borderRadius: 4,
        background: "#fff",
        display: "block",
      }}
      title="Custom visualization"
    />
  );
}
