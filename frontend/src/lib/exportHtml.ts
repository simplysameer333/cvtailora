/**
 * Export-time HTML helpers for the template-faithful PDF path.
 *
 * The PDF is printed from the exact preview HTML, so export-only options
 * (like bolding JD keywords) are applied to that HTML here, client-side,
 * before it is sent — keeping the backend renderer a dumb printer.
 */

/** Escape a string for use inside a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Bold every occurrence of the given keywords in the HTML's TEXT nodes.
 * DOM-based (never regexes raw HTML): walks text nodes and wraps matches in
 * <b>, so tags/attributes can't be corrupted. Longest keyword wins on
 * overlaps; matching is case-insensitive on word boundaries.
 * Returns the input unchanged when there is nothing to do or on any failure.
 */
export function boldKeywordsInHtml(html: string, keywords: string[]): string {
  const kws = (keywords || []).map((k) => k.trim()).filter((k) => k.length >= 2);
  if (!html || kws.length === 0 || typeof window === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    kws.sort((a, b) => b.length - a.length);
    const re = new RegExp(`(?<![\\w])(${kws.map(escapeRe).join("|")})(?![\\w])`, "gi");

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = (n as Text).parentElement;
      // Don't bold inside places where markup is invalid or already emphasised.
      if (parent && !["SCRIPT", "STYLE", "TITLE", "B", "STRONG", "H1", "H2", "H3"].includes(parent.tagName)) {
        textNodes.push(n as Text);
      }
    }
    for (const node of textNodes) {
      const text = node.textContent ?? "";
      if (!re.test(text)) { re.lastIndex = 0; continue; }
      re.lastIndex = 0;
      const frag = doc.createDocumentFragment();
      let last = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
        const b = doc.createElement("b");
        b.textContent = m[0];
        frag.appendChild(b);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    }
    // Serialise back as a complete document (templates are standalone docs).
    return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
  } catch {
    return html; // bolding is an enhancement — never break the export for it
  }
}
