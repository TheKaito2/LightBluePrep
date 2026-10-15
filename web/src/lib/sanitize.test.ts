// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitize } from './sanitize'

function clean(html: string): HTMLElement {
  const host = document.createElement('div')
  host.replaceChildren(sanitize(html))
  return host
}

describe('sanitize', () => {
  it('drops elements that run code, load pages or submit forms', () => {
    const host = clean('<p>a</p><script>x()</script><iframe src="https://e"></iframe>'
      + '<object data="x"></object><embed src="x"><meta http-equiv="refresh" content="0;url=https://e">'
      + '<base href="https://e/"><form action="https://e"><input name="q"></form><p>b</p>')
    expect(host.innerHTML).toBe('<p>a</p><p>b</p>')
  })

  it('strips event handlers, including on SVG', () => {
    const host = clean('<img src="data:image/png;base64,AAAA" onerror="x()">'
      + '<svg onload="x()"><circle r="1" onclick="x()"></circle></svg>')
    expect(host.innerHTML).not.toMatch(/on(error|load|click)/)
    expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('removes script URLs and outbound links but keeps the text', () => {
    const host = clean('<a href="javascript:x()">one</a> <a href="https://evil.example">two</a>'
      + '<img src="javascript:x()">')
    expect(host.textContent).toBe('one two')
    expect(host.querySelector('a[href]')).toBeNull()
    expect(host.querySelector('img')?.hasAttribute('src')).toBe(false)
  })

  it('keeps in-figure references and drops SVG animation', () => {
    const host = clean('<svg><defs><path id="p1" d="M0 0"></path></defs>'
      + '<use xlink:href="#p1"></use><use href="https://e/x.svg#a"></use>'
      + '<animate attributeName="href" to="javascript:x()"></animate>'
      + '<set attributeName="href" to="javascript:x()"></set></svg>')
    const uses = host.querySelectorAll('use')
    expect(uses[0]!.getAttribute('xlink:href')).toBe('#p1')
    expect(uses[1]!.hasAttribute('href')).toBe(false)
    expect(host.querySelector('animate, set')).toBeNull()
  })

  it('leaves official markup alone: MathML, tables, styles, data images', () => {
    const html = '<p class="stem_paragraph" style="text-align: center;">Solve '
      + '<math alttext="x"><mrow><mi>x</mi><mo>+</mo><mn>2</mn></mrow></math></p>'
      + '<table><thead><tr><th>t</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>'
      + '<svg viewBox="0 0 10 10"><style>.a{fill:red}</style><rect class="a" width="5" height="5"></rect></svg>'
      + '<img alt="graph" src="data:image/png;base64,AAAA">'
    expect(clean(html).innerHTML).toBe(html)
  })
})
