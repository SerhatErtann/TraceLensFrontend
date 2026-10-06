/**
 * Asistan cevapları için küçük ve güvenli markdown: önce tüm HTML kaçışlanır, sonra yalnızca **kalın**, `kod`,
 * madde/numaralı liste, paragraf ve dashboard içi linkler ([metin](/services?…)) üretilir. Dış adreslere link verilmez.
 */
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    // Sadece "/" ile başlayan göreli yollar; javascript: vb. hiçbir zaman link olmaz
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (_, label: string, href: string) => `<a href="${href}" data-internal>${label}</a>`)
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r/g, '').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      const kind = bullet ? 'ul' : 'ol'
      if (list !== kind) {
        closeList()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`)
    } else if (heading) {
      flushParagraph()
      closeList()
      out.push(`<p><b>${inline(heading[1])}</b></p>`)
    } else if (!line.trim()) {
      flushParagraph()
      closeList()
    } else {
      closeList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  closeList()
  return out.join('')
}
