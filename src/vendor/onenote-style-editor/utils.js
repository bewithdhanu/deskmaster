export function generateId() {
  return `one-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getRelativePosition(event, container) {
  const rect = container.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + container.scrollLeft,
    y: event.clientY - rect.top + container.scrollTop
  };
}

export function throttle(fn, ms = 16) {
  let lastTime = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastTime >= ms) {
      lastTime = now;
      fn(...args);
    }
  };
}

export function injectStyles(css, id = 'onenote-editor-styles') {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isDescendant(parent, child) {
  let node = child;
  while (node) {
    if (node === parent) return true;
    node = node.parentNode;
  }
  return false;
}

function parseCssLengthToPx(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const m = raw.match(/^(-?\d+(?:\.\d+)?)(px|pt|in)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || 'px').toLowerCase();
  if (unit === 'pt') return (n * 96) / 72;
  if (unit === 'in') return n * 96;
  return n;
}

function normalizeHtmlFragment(html) {
  const raw = String(html || '').trim();
  if (!raw) return '';
  // Many apps put fragments on the clipboard without <html>/<body>.
  // Wrap so DOMParser always gives us a consistent document structure.
  return `<!doctype html><html><body>${raw}</body></html>`;
}

function isMeaningfulElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link') return false;
  // Ignore empty wrappers.
  if (!el.textContent?.trim() && !el.querySelector?.('img,table,svg,canvas')) return false;
  return true;
}

function isSpacerParagraph(p) {
  if (!p || p.nodeType !== 1) return false;
  if (p.tagName.toLowerCase() !== 'p') return false;
  const style = p.getAttribute('style') || '';
  // Only treat 1pt layout paragraphs as spacers. Empty 11pt paragraphs represent real blank lines.
  if (/\bfont-size\s*:\s*1pt\b/i.test(style)) return true;
  return false;
}

function cleanTdForContent(td) {
  const clone = td.cloneNode(true);
  try {
    clone.querySelectorAll('p').forEach((p) => {
      if (isSpacerParagraph(p)) p.remove();
    });

    // OneNote exports many lines as stacked <p> tags. When pasted into our contentEditable,
    // nested <p> tags can render with extra spacing/newlines depending on browser normalization.
    // Normalize to a single flow container with <br/> between lines.
    const ps = Array.from(clone.querySelectorAll('p'));
    if (ps.length >= 2) {
      const htmlLines = ps
        .map((p) => p.innerHTML || '')
        .map((s) => s.replace(/<span\b[^>]*mso-spacerun:yes[^>]*>[\s\S]*?<\/span>/gi, ' '))
        // Preserve empty lines (&nbsp;) but normalize indentation/newlines inside a line.
        .map((s) => s.replace(/\s*\n\s*/g, ' '))
        .map((s) => s.replace(/&nbsp;|\u00a0/gi, ' ').trim());
      ps.forEach((p) => p.remove());
      if (htmlLines.length) {
        const div = clone.ownerDocument.createElement('div');
        div.innerHTML = htmlLines.join('<br/>');
        clone.appendChild(div);
      }
    }

    // Remove leading empty lines/wrappers.
    const first = clone.firstChild;
    if (first && first.nodeType === 1) {
      const el = first;
      if (el.tagName.toLowerCase() === 'div') {
        let html = el.innerHTML || '';
        html = html
          .replace(/^(?:\s*<br\s*\/?>\s*)+/i, '')
          .replace(/^(?:\s*(?:&nbsp;|\u00a0)\s*)+/i, '');
        el.innerHTML = html;
        if (!el.textContent?.replace(/\u00a0/g, ' ').trim() && !el.querySelector?.('img,table')) {
          el.remove();
        }
      }
    }

    // Remove trailing empty <br> that create visual gaps.
    const last = clone.lastChild;
    if (last && last.nodeType === 1) {
      const el = last;
      if (el.tagName.toLowerCase() === 'div') {
        let html = el.innerHTML || '';
        html = html.replace(/(?:<br\s*\/?>\s*)+$/i, '');
        el.innerHTML = html;
      }
    }
  } catch {}
  return clone;
}

function normalizePastedHtml(rootEl) {
  if (!rootEl) return;
  try {
    // Remove Word/OneNote spacer runs.
    rootEl.querySelectorAll('span').forEach((s) => {
      const st = s.getAttribute('style') || '';
      if (/\bmso-spacerun\s*:\s*yes\b/i.test(st)) {
        s.replaceWith(rootEl.ownerDocument.createTextNode(' '));
      }
    });

    // Force consistent paragraph spacing.
    rootEl.querySelectorAll('p').forEach((p) => {
      if (isSpacerParagraph(p)) {
        p.remove();
        return;
      }
      const style = p.getAttribute('style') || '';
      // Preserve other styles but ensure margins don't introduce blank lines.
      const next = style
        .replace(/\bmargin\s*:\s*[^;]+;?/gi, '')
        .replace(/\bmargin-top\s*:\s*[^;]+;?/gi, '')
        .replace(/\bmargin-bottom\s*:\s*[^;]+;?/gi, '');
      const cleaned = `${next};margin:0;`.replace(/\s*;\s*;/g, ';').trim();
      p.setAttribute('style', cleaned);
    });

    // If this fragment is basically a stack of paragraphs, convert it into a single flow block.
    // This avoids browser-specific paragraph spacing inside contentEditable.
    const directPs = Array.from(rootEl.children || []).filter((c) => c.tagName && c.tagName.toLowerCase() === 'p');
    if (directPs.length >= 2 && directPs.length === (rootEl.children?.length || 0)) {
      const htmlLines = directPs
        .map((p) => p.innerHTML || '')
        // Preserve inline spacing, but normalize indentation/newlines OneNote injects.
        .map((s) => s.replace(/\s*\n\s*/g, ' '))
        .map((s) => s.replace(/&nbsp;|\u00a0/gi, ' ').trim());
      directPs.forEach((p) => p.remove());
      if (htmlLines.length) {
        const div = rootEl.ownerDocument.createElement('div');
        div.innerHTML = htmlLines.join('<br/>');
        rootEl.appendChild(div);
      }
    }

    // Strip margins/line-height/height-like props that can create large empty blocks.
    rootEl.querySelectorAll('[style]').forEach((n) => {
      const style = n.getAttribute('style') || '';
      const next = style
        .replace(/\bmargin\s*:\s*[^;]+;?/gi, '')
        .replace(/\bmargin-(top|bottom|left|right)\s*:\s*[^;]+;?/gi, '')
        .replace(/\bline-height\s*:\s*[^;]+;?/gi, '')
        .replace(/\bheight\s*:\s*[^;]+;?/gi, '')
        .replace(/\bmin-height\s*:\s*[^;]+;?/gi, '');
      const cleaned = next.replace(/\s*;\s*;/g, ';').trim();
      if (cleaned) n.setAttribute('style', cleaned);
      else n.removeAttribute('style');
    });

    // Collapse consecutive <br> to at most one, and drop trailing <br>.
    const html = rootEl.innerHTML || '';
    rootEl.innerHTML = html
      .replace(/^(?:\s*<br\s*\/?>\s*)+/gi, '')
      // Remove leading whitespace-only text nodes (important because the editor uses white-space: pre-wrap)
      .replace(/^\s+/, '')
      // Remove indentation spaces after line breaks (OneNote often emits newlines + spaces)
      .replace(/(<br\s*\/?>)\s+/gi, '$1')
      // Keep consecutive <br> (they represent intentional empty lines in OneNote).
      .replace(/(?:<br\s*\/?>\s*)+$/gi, '')
      // Remove indentation/newline-only whitespace between tags (but keep meaningful single spaces).
      .replace(/>(?:[ \t]*\n[ \t]*)+</g, '><');
  } catch {}
}

function normalizeContentForDedupe(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function dedupeBlocks(blocks) {
  const seen = new Set();
  const out = [];
  for (const b of blocks) {
    const text = normalizeContentForDedupe(b.content);
    // Round positions so tiny float differences don't prevent dedupe.
    const rx = Math.round((Number(b.x) || 0) / 2) * 2;
    const ry = Math.round((Number(b.y) || 0) / 2) * 2;
    const key = `${rx},${ry},${text}`;
    if (text && seen.has(key)) continue;
    if (text) seen.add(key);
    out.push(b);
  }
  return out;
}

function elementOuterHtmlClean(el) {
  if (!el) return '';
  // Keep element mostly as-is; TextBlock stores HTML and renders it in contentEditable.
  // But strip absolute positioning to avoid pasted HTML overlaying other blocks.
  const clone = el.cloneNode(true);
  try {
    normalizePastedHtml(clone);
    const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      const n = node;
      const style = n.getAttribute?.('style');
      if (style) {
        // Remove position/left/top which can create overlays inside a single block.
        const next = style
          .replace(/\bposition\s*:\s*absolute\s*;?/gi, '')
          .replace(/\bleft\s*:\s*[^;]+;?/gi, '')
          .replace(/\btop\s*:\s*[^;]+;?/gi, '')
          .replace(/\btransform\s*:\s*[^;]+;?/gi, '')
          .replace(/\bheight\s*:\s*[^;]+;?/gi, '')
          .replace(/\bmin-height\s*:\s*[^;]+;?/gi, '');
        const cleaned = next.replace(/\s*;\s*;/g, ';').trim();
        if (cleaned) n.setAttribute('style', cleaned);
        else n.removeAttribute('style');
      }
      node = walker.nextNode();
    }
  } catch {}
  // Avoid invalid HTML inside contentEditable (e.g. <td> cannot be a child of <div>).
  const tag = clone.tagName?.toLowerCase?.() || '';
  if (tag === 'td') {
    const wrap = clone.ownerDocument.createElement('div');
    wrap.innerHTML = clone.innerHTML || '';
    return wrap.outerHTML;
  }
  return clone.outerHTML || clone.innerHTML || '';
}

function collectPositionedCandidates(root) {
  const results = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    const el = node;
    const style = el.getAttribute('style') || '';
    // Heuristic: OneNote often uses absolute positioning in exported HTML fragments.
    if (/position\s*:\s*absolute/i.test(style) && (/\bleft\s*:/i.test(style) || /\btop\s*:/i.test(style))) {
      results.push(el);
    }
    node = walker.nextNode();
  }
  return results;
}

function extractAbsolutePosition(el) {
  const style = el.getAttribute('style') || '';
  const leftMatch = style.match(/\bleft\s*:\s*([^;]+)\s*;?/i);
  const topMatch = style.match(/\btop\s*:\s*([^;]+)\s*;?/i);
  const widthMatch = style.match(/\bwidth\s*:\s*([^;]+)\s*;?/i);

  const left = leftMatch ? parseCssLengthToPx(leftMatch[1]) : null;
  const top = topMatch ? parseCssLengthToPx(topMatch[1]) : null;
  const width = widthMatch ? parseCssLengthToPx(widthMatch[1]) : null;

  if (left == null && top == null) return null;
  return { x: left ?? 0, y: top ?? 0, width: width ?? null };
}

function extractMarginPosition(el) {
  const style = el.getAttribute('style') || '';
  const leftMatch = style.match(/\bmargin-left\s*:\s*([^;]+)\s*;?/i);
  const topMatch = style.match(/\bmargin-top\s*:\s*([^;]+)\s*;?/i);
  const widthMatch = style.match(/\bwidth\s*:\s*([^;]+)\s*;?/i);
  const left = leftMatch ? parseCssLengthToPx(leftMatch[1]) : null;
  const top = topMatch ? parseCssLengthToPx(topMatch[1]) : null;
  const width = widthMatch ? parseCssLengthToPx(widthMatch[1]) : null;
  if (left == null && top == null) return null;
  return { x: left ?? 0, y: top ?? 0, width: width ?? null };
}

function extractOneNoteLayoutTables(bodyEl) {
  const tables = Array.from(bodyEl.querySelectorAll('table'));
  return tables
    .map((table) => {
      const style = table.getAttribute('style') || '';
      const topMatch = style.match(/\bmargin-top\s*:\s*([^;]+)\s*;?/i);
      const leftMatch = style.match(/\bmargin-left\s*:\s*([^;]+)\s*;?/i);
      const tableTop = topMatch ? parseCssLengthToPx(topMatch[1]) : 0;
      const tableLeft = leftMatch ? parseCssLengthToPx(leftMatch[1]) : 0;

      // DOMParser typically inserts a <tbody>, so handle both structures.
      const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr'));
      if (!rows.length) return null;

      // Column widths come from the first row's tds.
      const firstCells = Array.from(rows[0].children || []).filter(
        (n) => n.tagName && n.tagName.toLowerCase() === 'td'
      );
      const colWidths = firstCells.map((td) => {
        const st = td.getAttribute('style') || '';
        const wMatch = st.match(/\bwidth\s*:\s*([^;]+)\s*;?/i);
        const w = wMatch ? parseCssLengthToPx(wMatch[1]) : null;
        return w ?? 0;
      });

      // Row heights: use each row's first td height if present.
      const rowHeights = rows.map((row) => {
        const tds = Array.from(row.children || []).filter((n) => n.tagName && n.tagName.toLowerCase() === 'td');
        const st = tds[0]?.getAttribute?.('style') || '';
        const hMatch = st.match(/\bheight\s*:\s*([^;]+)\s*;?/i);
        const h = hMatch ? parseCssLengthToPx(hMatch[1]) : null;
        return h ?? 0;
      });

      // Heuristic: ignore tiny spacer-only layout tables.
      const hasContent = table.querySelector('p:not([style*="font-size:1pt"]),img,table,a');
      if (!hasContent) return null;

      return { table, tableTop: tableTop ?? 0, tableLeft: tableLeft ?? 0, rows, colWidths, rowHeights };
    })
    .filter(Boolean);
}

function isOneNotePositionedDiv(divEl) {
  if (!divEl || divEl.nodeType !== 1) return false;
  if (divEl.tagName.toLowerCase() !== 'div') return false;
  const pos = extractMarginPosition(divEl);
  if (!pos) return false;
  // Ignore wrapper divs that contain other positioned divs or layout tables.
  if (divEl.querySelector?.('table')) return false;
  if (divEl.querySelector?.('div[style*="margin-left"],div[style*="margin-top"]')) return false;
  // Must contain real content.
  return Boolean(divEl.querySelector?.('p,img,a') || divEl.textContent?.trim());
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function getOneNoteRegionNodes(rootEl, layoutByTable) {
  const regions = [];
  const walker = rootEl.ownerDocument.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    const el = node;
    const tag = el.tagName?.toLowerCase?.() || '';

    if (tag === 'table' && layoutByTable.has(el)) {
      regions.push({ type: 'table', el });
      node = walker.nextSibling();
      continue;
    }

    if (tag === 'div' && el.getAttribute?.('style') && isOneNotePositionedDiv(el)) {
      regions.push({ type: 'div', el });
      node = walker.nextSibling();
      continue;
    }

    node = walker.nextNode();
  }
  return regions;
}

function flattenToTopLevelBlocks(bodyEl) {
  const blocks = [];
  const children = Array.from(bodyEl.children || []);
  for (const child of children) {
    if (!isMeaningfulElement(child)) continue;
    blocks.push(child);
  }
  // If body is a single wrapper (common), unwrap one level.
  if (blocks.length === 1) {
    const only = blocks[0];
    const inner = Array.from(only.children || []).filter(isMeaningfulElement);
    if (inner.length >= 2) return inner;
  }
  return blocks;
}

function collectFlowBlocks(bodyEl) {
  const out = [];
  const doc = bodyEl.ownerDocument;
  const walker = doc.createTreeWalker(bodyEl, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    const el = node;
    const tag = el.tagName?.toLowerCase?.() || '';
    // Prefer semantic leaf-ish nodes.
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (src) {
        out.push({ kind: 'img', el });
        // don't also add wrappers that contain this image
      }
    } else if (tag === 'table') {
      out.push({ kind: 'table', el });
    } else if (tag === 'p' || tag === 'pre' || tag === 'blockquote' || tag === 'ul' || tag === 'ol' || tag === 'li') {
      if (isMeaningfulElement(el)) out.push({ kind: tag, el });
    } else if (/^h[1-6]$/.test(tag)) {
      if (isMeaningfulElement(el)) out.push({ kind: tag, el });
    }
    node = walker.nextNode();
  }

  // If we found nothing meaningful, fallback to top-level blocks.
  if (!out.length) {
    flattenToTopLevelBlocks(bodyEl).forEach((el) => out.push({ kind: 'block', el }));
  }

  // De-duplicate nested picks: if we picked a <ul>, drop its <li> children.
  const picked = out.map((x) => x.el);
  const set = new Set(picked);
  return out.filter(({ el }) => {
    let p = el.parentElement;
    while (p) {
      if (set.has(p) && ['ul', 'ol', 'table'].includes(p.tagName.toLowerCase())) return false;
      p = p.parentElement;
    }
    return true;
  });
}

function renderFlowBlock({ kind, el }, maxWidth) {
  if (kind === 'img') {
    const src = el.getAttribute('src') || '';
    const alt = el.getAttribute('alt') || '';
    return {
      width: maxWidth,
      content: `<div><img src="${src}" alt="${alt.replace(/"/g, '&quot;')}" style="max-width: 100%; height: auto; display: block;" /></div>`
    };
  }
  // For tables/lists/paragraphs/headings, keep HTML but sanitize positioning.
  return { width: maxWidth, content: elementOuterHtmlClean(el) };
}

export function clipboardHtmlToCanvasBlocks(html, { anchorX = 80, anchorY = 80, maxWidth = 520 } = {}) {
  const normalized = normalizeHtmlFragment(html);
  let doc;
  try {
    doc = new DOMParser().parseFromString(normalized, 'text/html');
  } catch {
    return { blocks: [], usedAbsolute: false };
  }
  const body = doc.body;
  if (!body) return { blocks: [], usedAbsolute: false };

  // OneNote often uses layout tables + margin-left/top in inches to position regions.
  // When multiple tables appear, their margin-top is relative in the HTML flow; accumulate a vertical offset.
  const layoutTables = extractOneNoteLayoutTables(body);
  const hasOneNoteTables = layoutTables.length > 0;
  const hasOneNoteDivs = Array.from(body.querySelectorAll('div[style]')).some(isOneNotePositionedDiv);
  if (hasOneNoteTables || hasOneNoteDivs) {
    const out = [];
    let flowYOffset = 0;

    const layoutByTable = new Map(layoutTables.map((t) => [t.table, t]));
    const regions = getOneNoteRegionNodes(body, layoutByTable);
    for (const region of regions) {
      const el = region.el;

      if (region.type === 'table') {
        const layout = layoutByTable.get(el);
        if (!layout) continue;

        const { rows, colWidths, rowHeights, tableLeft, tableTop } = layout;
        const regionTop = flowYOffset + (tableTop || 0);
        let yCursor = anchorY + regionTop;
        let effectiveRegionHeight = 0;

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          let xCursor = anchorX + (tableLeft || 0);
          const tds = Array.from(row.children || []).filter((n) => n.tagName && n.tagName.toLowerCase() === 'td');
          let rowHasContent = false;
          for (let c = 0; c < tds.length; c++) {
            const td = tds[c];
            const cleanedTd = cleanTdForContent(td);
            const meaningfulText = cleanedTd.textContent?.replace(/\u00a0/g, ' ').trim();
            const meaningful = isMeaningfulElement(cleanedTd) && meaningfulText;
            const hasMedia = cleanedTd.querySelector?.('img,table');
            const colSpan = Math.max(1, Number(td.getAttribute('colspan') || 1) || 1);
            if (meaningful || hasMedia) {
              rowHasContent = true;
              const tdStyle = td.getAttribute('style') || '';
              const wMatch = tdStyle.match(/\bwidth\s*:\s*([^;]+)\s*;?/i);
              const w = wMatch ? parseCssLengthToPx(wMatch[1]) : null;
              const spanWidth =
                colSpan > 1
                  ? colWidths.slice(c, c + colSpan).reduce((sum, cw) => sum + (cw || 0), 0)
                  : 0;
              const widthPx = w ?? (spanWidth || null);
              const width = widthPx ? Math.max(160, Math.min(widthPx, 1200)) : null;
              out.push({
                x: xCursor,
                y: yCursor,
                width,
                content: elementOuterHtmlClean(cleanedTd)
              });
            }

            const advance = colWidths.slice(c, c + colSpan).reduce((sum, cw) => sum + (cw || 0), 0);
            xCursor += advance || colWidths[c] || 0;
            if (colSpan > 1) c += colSpan - 1;
          }
          const rawH = rowHeights[r] || 0;
          // OneNote layout tables include many spacer rows with non-zero heights.
          // If a row has no real content, don't advance by the full height; keep a tiny gap.
          const effH = rowHasContent ? rawH : Math.min(rawH, 6);
          yCursor += effH;
          effectiveRegionHeight += effH;
        }

        flowYOffset = regionTop + effectiveRegionHeight + 24;
        continue;
      }

      if (region.type === 'div') {
        const pos = extractMarginPosition(el);
        if (!pos) continue;
        out.push({
          x: anchorX + pos.x,
          y: anchorY + flowYOffset + pos.y,
          width: pos.width ? Math.max(120, Math.min(pos.width, 1200)) : null,
          content: elementOuterHtmlClean(el)
        });
        flowYOffset += (pos.y || 0) + 72;
      }
    }

    if (out.length) {
      out.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      return { blocks: dedupeBlocks(out), usedAbsolute: true };
    }
  }

  // Next-best: OneNote uses nested divs with margin-left/top and width (in inches).
  const marginDivs = Array.from(body.querySelectorAll('div[style]'))
    .filter(isOneNotePositionedDiv)
    .map((d) => {
      const pos = extractMarginPosition(d);
      if (!pos) return null;
      if (!isMeaningfulElement(d)) return null;
      return {
        x: anchorX + pos.x,
        y: anchorY + pos.y,
        width: pos.width ? Math.max(120, Math.min(pos.width, 1200)) : null,
        content: elementOuterHtmlClean(d)
      };
    })
    .filter(Boolean);
  if (marginDivs.length >= 2) {
    marginDivs.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    return { blocks: marginDivs, usedAbsolute: true };
  }

  const positioned = collectPositionedCandidates(body)
    .map((el) => {
      const pos = extractAbsolutePosition(el);
      if (!pos) return null;
      if (!isMeaningfulElement(el)) return null;
      return {
        x: anchorX + pos.x,
        y: anchorY + pos.y,
        width: pos.width ? Math.max(120, Math.min(pos.width, 1200)) : null,
        content: elementOuterHtmlClean(el)
      };
    })
    .filter(Boolean);

  if (positioned.length) {
    // Sort by y then x for stable insertion order.
    positioned.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    return { blocks: positioned, usedAbsolute: true };
  }

  // Fallback: auto-layout in reading order.
  const flow = collectFlowBlocks(body);
  const out = [];
  let y = anchorY;
  const x = anchorX;
  const gap = 18;

  for (const item of flow) {
    const rendered = renderFlowBlock(item, maxWidth);
    if (!rendered?.content) continue;
    out.push({ x, y, width: rendered.width, content: rendered.content });
    y += 56 + gap;
  }
  return { blocks: out, usedAbsolute: false };
}

export function clipboardPlainTextToCanvasBlocks(text, { anchorX = 80, anchorY = 80, maxWidth = 520 } = {}) {
  const t = String(text || '');
  if (!t.trim()) return [];
  const lines = t.replace(/\r\n/g, '\n').split('\n');
  const chunks = [];
  let current = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) {
        chunks.push(current.join('\n'));
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length) chunks.push(current.join('\n'));

  let y = anchorY;
  const gap = 18;
  return chunks.map((chunk) => {
    const content = chunk
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    const block = { x: anchorX, y, width: maxWidth, content };
    y += 56 + gap;
    return block;
  });
}
