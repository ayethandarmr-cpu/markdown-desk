import MarkdownIt from 'markdown-it'
import Token from 'markdown-it/lib/token.mjs'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
function parser(images: boolean) {
  const md = new MarkdownIt({
    html:false, linkify:true,
    highlight(source, language) {
      return language && hljs.getLanguage(language) ? hljs.highlight(source,{language,ignoreIllegals:true}).value : ''
    }
  })
  const allowed = /^(https?:\/\/|mailto:|#)/i
  md.validateLink = url => allowed.test(url)
  md.renderer.rules.link_open = (tokens,index,options,_env,self) => {
    if (/^https?:/i.test(tokens[index].attrGet('href') || '')) {
      tokens[index].attrSet('target','_blank')
      tokens[index].attrSet('rel','noopener noreferrer')
    }
    return self.renderToken(tokens,index,options)
  }
  const renderImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens,index,options,env,self) => {
    const token = tokens[index]
    if (!images || !/^https:\/\//i.test(token.attrGet('src') || '')) {
      return md.utils.escapeHtml('[Image: ' + self.renderInlineAsText(token.children || [],options,env) + ']')
    }
    token.attrSet('referrerpolicy','no-referrer')
    token.attrSet('loading','lazy')
    return renderImage!(tokens,index,options,env,self)
  }
  return md
}
export function markdown(source: string, images: boolean) {
  const md = parser(images)
  const tokens = md.parse(source,{})
  const headings: {id:string; line:number; title:string; level:number}[] = []
  tokens.forEach((token,index) => {
    const inline = tokens[index+1]
    if (token.type === 'heading_open') {
      const id = 'heading-' + headings.length
      token.attrSet('id',id)
      headings.push({id,line:(token.map?.[0] ?? 0)+1,title:inline.content,level:Number(token.tag.slice(1))})
    }
    if (token.type === 'list_item_open' && inline?.type === 'paragraph_open') {
      const content = tokens[index+2]
      const match = /^\[([ xX])\]\s/.exec(content?.content || '')
      const first = content?.children?.[0]
      if (match && first?.type === 'text' && first.content.startsWith(match[0])) {
        first.content = first.content.slice(match[0].length)
        const checkbox = new Token('html_inline','',0)
        checkbox.content = '<input type="checkbox" disabled ' + (match[1] !== ' ' ? 'checked' : '') + '> '
        content.children!.unshift(checkbox)
      }
    }
  })
  const html = DOMPurify.sanitize(md.renderer.render(tokens,md.options,{}), {
    ALLOWED_TAGS:['p','a','em','strong','s','img','ol','ul','li','hr','br','blockquote','pre','code','span','table','thead','tbody','tr','th','td','h1','h2','h3','h4','h5','h6','input'],
    ALLOWED_ATTR:['href','target','rel','src','alt','title','loading','referrerpolicy','start','class','id','style','type','disabled','checked'],
  })
  return {html,headings}
}
