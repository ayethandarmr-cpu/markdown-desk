import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import Highlight from '@tiptap/extension-highlight'
import { DriveImage } from './images'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import Typography from '@tiptap/extension-typography'
import { createLowlight, common } from 'lowlight'
import { Search } from './search'
import { SuggestDel, SuggestIns } from './suggest'
import { ColoredText, Color, Toggle, DetailsSummary, DetailsContent } from './htmlBlocks'

const lowlight = createLowlight(common)

export function buildExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    Table.configure({ resizable: false }),
    TableRow, TableHeader, TableCell,
    TaskList, TaskItem.configure({ nested: true }),
    Highlight,
    ColoredText, Color,
    SuggestDel, SuggestIns,
    Toggle, DetailsSummary, DetailsContent,
    DriveImage.configure({ allowBase64: false }),
    Typography,
    CharacterCount,
    Placeholder.configure({ placeholder: 'Start writing…' }),
    Search,
    Markdown.configure({ indentation: { style: 'space', size: 2 } }),
  ]
}
