// const escapeHtml = require('./escapeHtml');

// /**
//  * Decodes a BlockNote editor content array into HTML. This is the single
//  * shared renderer used for every blog post / project case study — the JSON
//  * blob stored in the `content` column differs per row, but this function is
//  * what turns any of them into the same styled markup inside the shared
//  * template.
//  *
//  * BlockNote block shape:
//  *   { id, type, props: {...}, content: [ inlineNode, ... ], children: [ block, ... ] }
//  *
//  * Inline node shape:
//  *   { type: 'text', text: '...', styles: { bold, italic, underline, strike, code, textColor, backgroundColor } }
//  *   { type: 'link', content: [inlineNode, ...], href: '...' }
//  */

// function styleAttrs(props = {}) {
//   const styles = [];
//   if (props.textAlignment && props.textAlignment !== 'left') {
//     styles.push(`text-align: ${props.textAlignment}`);
//   }
//   if (props.textColor && props.textColor !== 'default') {
//     styles.push(`color: var(--bn-color-${props.textColor}, ${props.textColor})`);
//   }
//   if (props.backgroundColor && props.backgroundColor !== 'default') {
//     styles.push(`background-color: var(--bn-bg-${props.backgroundColor}, ${props.backgroundColor})`);
//   }
//   return styles.length ? ` style="${styles.join('; ')}"` : '';
// }

// // Renders an array of inline content nodes (text/link runs with styles) to HTML.
// function renderInline(content) {
//   if (!Array.isArray(content)) return '';

//   return content
//     .map((node) => {
//       if (!node) return '';

//       if (node.type === 'link') {
//         const inner = renderInline(node.content);
//         const href = escapeHtml(node.href || '#');
//         return `<a href="${href}" target="_blank" rel="noopener">${inner}</a>`;
//       }

//       // default: text node
//       let text = escapeHtml(node.text || '');
//       const s = node.styles || {};

//       if (s.code) text = `<code>${text}</code>`;
//       if (s.bold) text = `<strong>${text}</strong>`;
//       if (s.italic) text = `<em>${text}</em>`;
//       if (s.underline) text = `<u>${text}</u>`;
//       if (s.strike) text = `<s>${text}</s>`;
//       if (s.textColor && s.textColor !== 'default') {
//         text = `<span style="color: var(--bn-color-${s.textColor}, ${s.textColor})">${text}</span>`;
//       }
//       if (s.backgroundColor && s.backgroundColor !== 'default') {
//         text = `<span style="background-color: var(--bn-bg-${s.backgroundColor}, ${s.backgroundColor})">${text}</span>`;
//       }

//       return text;
//     })
//     .join('');
// }

// function renderTable(block) {
//   const tableContent = block.content || {};
//   const rows = tableContent.rows || [];

//   const rowsHtml = rows
//     .map((row) => {
//       const cellsHtml = (row.cells || [])
//         .map((cell) => {
//           const cellProps = cell.props || {};
//           const attrs = [];
//           if (cellProps.colspan && cellProps.colspan !== 1) attrs.push(`colspan="${cellProps.colspan}"`);
//           if (cellProps.rowspan && cellProps.rowspan !== 1) attrs.push(`rowspan="${cellProps.rowspan}"`);
//           const style = styleAttrs(cellProps);
//           return `<td ${attrs.join(' ')}${style}>${renderInline(cell.content)}</td>`;
//         })
//         .join('');
//       return `<tr>${cellsHtml}</tr>`;
//     })
//     .join('');

//   return `<table><tbody>${rowsHtml}</tbody></table>`;
// }

// // Renders a single block (and recursively its children) to HTML.
// function renderBlock(block) {
//   if (!block || !block.type) return '';

//   const props = block.props || {};
//   const attrs = styleAttrs(props);
//   const childrenHtml = Array.isArray(block.children) && block.children.length
//     ? renderBlocks(block.children)
//     : '';

//   switch (block.type) {
//     case 'heading': {
//       const level = Math.min(Math.max(props.level || 2, 1), 6);
//       return `<h${level}${attrs}>${renderInline(block.content)}</h${level}>${childrenHtml}`;
//     }

//     case 'paragraph': {
//       const inner = renderInline(block.content);
//       if (!inner.trim() && !childrenHtml) return '';
//       return `<p${attrs}>${inner}</p>${childrenHtml}`;
//     }

//     case 'bulletListItem':
//       return `<ul><li${attrs}>${renderInline(block.content)}${childrenHtml}</li></ul>`;

//     case 'numberedListItem':
//       return `<ol><li${attrs}>${renderInline(block.content)}${childrenHtml}</li></ol>`;

//     case 'toggleListItem':
//       return `<details${attrs}><summary>${renderInline(block.content)}</summary>${childrenHtml}</details>`;

//     case 'quote':
//       return `<blockquote${attrs}><p>${renderInline(block.content)}</p></blockquote>`;

//     case 'codeBlock': {
//       const lang = props.language ? ` class="language-${escapeHtml(props.language)}"` : '';
//       const code = Array.isArray(block.content)
//         ? block.content.map((n) => n.text || '').join('')
//         : '';
//       return `<pre><code${lang}>${escapeHtml(code)}</code></pre>`;
//     }

//     case 'image': {
//       const url = props.url || '';
//       const caption = props.caption ? escapeHtml(props.caption) : '';
//       const figcaption = caption ? `<figcaption>${caption}</figcaption>` : '';
//       const width = props.previewWidth ? ` style="max-width: ${props.previewWidth}px"` : '';
//       return `<figure${attrs}><img src="${escapeHtml(url)}" alt="${caption}" loading="lazy"${width} />${figcaption}</figure>`;
//     }

//     case 'table':
//       return renderTable(block);

//     case 'divider':
//       return '<hr class="rule" style="margin: 2rem 0;" />';

//     default:
//       return childrenHtml;
//   }
// }

// function renderBlocks(blocks) {
//   if (!Array.isArray(blocks)) return '';
//   return blocks.map(renderBlock).join('\n');
// }

// module.exports = renderBlocks;


const escapeHtml = require('./escapeHtml');

/**
 * Derives a human-readable alt-text fallback from an uploaded file's URL,
 * e.g. "/uploads/blog-content/sunset-over-goa-beach.jpg" -> "Sunset Over Goa Beach".
 * Used only when the editor didn't set a caption — so every image gets a
 * meaningful alt automatically, straight from the (now-meaningful) filename,
 * with zero extra editor work and zero client-side script.
 */
function altFromUrl(url) {
  if (!url) return '';
  const filename = url.split('/').pop() || '';
  const base = filename.replace(/\.[^.]+$/, ''); // strip extension
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function styleAttrs(props = {}) {
  const styles = [];
  if (props.textAlignment && props.textAlignment !== 'left') {
    styles.push(`text-align: ${props.textAlignment}`);
  }
  if (props.textColor && props.textColor !== 'default') {
    styles.push(`color: var(--bn-color-${props.textColor}, ${props.textColor})`);
  }
  if (props.backgroundColor && props.backgroundColor !== 'default') {
    styles.push(`background-color: var(--bn-bg-${props.backgroundColor}, ${props.backgroundColor})`);
  }
  return styles.length ? ` style="${styles.join('; ')}"` : '';
}

// Renders an array of inline content nodes (text/link runs with styles) to HTML.
function renderInline(content) {
  if (!Array.isArray(content)) return '';

  return content
    .map((node) => {
      if (!node) return '';

      if (node.type === 'link') {
        const inner = renderInline(node.content);
        const href = escapeHtml(node.href || '#');
        return `<a href="${href}" target="_blank" rel="noopener">${inner}</a>`;
      }

      // default: text node
      let text = escapeHtml(node.text || '');
      const s = node.styles || {};

      if (s.code) text = `<code>${text}</code>`;
      if (s.bold) text = `<strong>${text}</strong>`;
      if (s.italic) text = `<em>${text}</em>`;
      if (s.underline) text = `<u>${text}</u>`;
      if (s.strike) text = `<s>${text}</s>`;
      if (s.textColor && s.textColor !== 'default') {
        text = `<span style="color: var(--bn-color-${s.textColor}, ${s.textColor})">${text}</span>`;
      }
      if (s.backgroundColor && s.backgroundColor !== 'default') {
        text = `<span style="background-color: var(--bn-bg-${s.backgroundColor}, ${s.backgroundColor})">${text}</span>`;
      }

      return text;
    })
    .join('');
}

function renderTable(block) {
  const tableContent = block.content || {};
  const rows = tableContent.rows || [];

  const rowsHtml = rows
    .map((row) => {
      const cellsHtml = (row.cells || [])
        .map((cell) => {
          const cellProps = cell.props || {};
          const attrs = [];
          if (cellProps.colspan && cellProps.colspan !== 1) attrs.push(`colspan="${cellProps.colspan}"`);
          if (cellProps.rowspan && cellProps.rowspan !== 1) attrs.push(`rowspan="${cellProps.rowspan}"`);
          const style = styleAttrs(cellProps);
          return `<td ${attrs.join(' ')}${style}>${renderInline(cell.content)}</td>`;
        })
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('');

  return `<table><tbody>${rowsHtml}</tbody></table>`;
}

// Returns the wrapping list tag for a given block type, or null if the
// block isn't a list item.
function listTagFor(type) {
  if (type === 'bulletListItem') return 'ul';
  if (type === 'numberedListItem') return 'ol';
  return null;
}

// Renders a single block (and recursively its children) to HTML.
// NOTE: list items ('bulletListItem' / 'numberedListItem') intentionally do
// NOT wrap themselves in <ul>/<ol> here — that's handled by renderBlocks so
// that consecutive sibling items share a single list wrapper instead of each
// getting their own.
function renderBlock(block) {
  if (!block || !block.type) return '';

  const props = block.props || {};
  const attrs = styleAttrs(props);
  const childrenHtml = Array.isArray(block.children) && block.children.length
    ? renderBlocks(block.children)
    : '';

  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(props.level || 2, 1), 6);
      return `<h${level}${attrs}>${renderInline(block.content)}</h${level}>${childrenHtml}`;
    }

    case 'paragraph': {
      const inner = renderInline(block.content);
      if (!inner.trim() && !childrenHtml) return '';
      return `<p${attrs}>${inner}</p>${childrenHtml}`;
    }

    case 'bulletListItem':
    case 'numberedListItem':
      return `<li${attrs}>${renderInline(block.content)}${childrenHtml}</li>`;

    case 'toggleListItem':
      return `<details${attrs}><summary>${renderInline(block.content)}</summary>${childrenHtml}</details>`;

    case 'quote':
      return `<blockquote${attrs}><p>${renderInline(block.content)}</p></blockquote>`;

    case 'codeBlock': {
      const lang = props.language ? ` class="language-${escapeHtml(props.language)}"` : '';
      const code = Array.isArray(block.content)
        ? block.content.map((n) => n.text || '').join('')
        : '';
      return `<pre><code${lang}>${escapeHtml(code)}</code></pre>`;
    }

    case 'image': {
      const url = props.url || '';
      const caption = props.caption ? escapeHtml(props.caption) : '';
      const figcaption = caption ? `<figcaption>${caption}</figcaption>` : '';
      const width = props.previewWidth ? ` style="max-width: ${props.previewWidth}px"` : '';
      // alt = caption if the editor wrote one, otherwise fall back to a
      // readable version of the filename (which, once uploads keep their
      // original name, is already SEO-meaningful).
      const alt = caption || escapeHtml(altFromUrl(url));
      return `<figure${attrs}><img src="${escapeHtml(url)}" alt="${alt}" loading="lazy"${width} />${figcaption}</figure>`;
    }

    case 'table':
      return renderTable(block);

    case 'divider':
      return '<hr class="rule" style="margin: 2rem 0;" />';

    default:
      return childrenHtml;
  }
}

// Renders an array of sibling blocks to HTML, grouping consecutive
// list-item blocks of the same type (bullet/numbered) into a single
// <ul>/<ol> wrapper instead of one wrapper per item.
function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';

  const html = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    const tag = listTagFor(block?.type);

    if (tag) {
      // Consume all consecutive siblings that produce the same list tag.
      const items = [];
      while (i < blocks.length && listTagFor(blocks[i]?.type) === tag) {
        items.push(renderBlock(blocks[i]));
        i++;
      }
      html.push(`<${tag}>${items.join('')}</${tag}>`);
    } else {
      html.push(renderBlock(block));
      i++;
    }
  }

  return html.join('\n');
}

module.exports = renderBlocks;