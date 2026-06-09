/**
 * RichTextEditor.tsx
 * Tiptap-based WYSIWYG editor — replaces the raw HTML textarea in ChapterForm.
 * Stores content as HTML (compatible with the existing dangerouslySetInnerHTML renderer
 * used in ChapterPage and the admin preview).
 *
 * Dependencies to add to package.json:
 *   "@tiptap/react": "^2.x"
 *   "@tiptap/starter-kit": "^2.x"
 *   "@tiptap/extension-underline": "^2.x"
 *   "@tiptap/extension-text-align": "^2.x"
 *   "@tiptap/extension-table": "^2.x"
 *   "@tiptap/extension-table-row": "^2.x"
 *   "@tiptap/extension-table-cell": "^2.x"
 *   "@tiptap/extension-table-header": "^2.x"
 *   "@tiptap/extension-image": "^2.x"
 *   "@tiptap/extension-link": "^2.x"
 *   "@tiptap/extension-color": "^2.x"
 *   "@tiptap/extension-text-style": "^2.x"
 *   "@tiptap/extension-highlight": "^2.x"
 *   "@tiptap/extension-subscript": "^2.x"
 *   "@tiptap/extension-superscript": "^2.x"
 *   "@tiptap/extension-character-count": "^2.x"
 *   "@tiptap/extension-placeholder": "^2.x"
 */

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useCallback, useEffect } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Minus, Link as LinkIcon,
  Image as ImageIcon, Table as TableIcon, Code, Quote,
  Heading1, Heading2, Heading3, Undo, Redo,
  Subscript as SubscriptIcon, Superscript as SuperscriptIcon,
  RemoveFormatting, Highlighter, Type,
} from "lucide-react";

// ─────────────────────────────── Types ───────────────────────────────────────

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

// ─────────────────────────────── Toolbar Button ───────────────────────────────

const ToolBtn = ({
  onClick, active = false, disabled = false, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    disabled={disabled}
    title={title}
    className={`
      inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm
      transition-colors select-none shrink-0
      ${active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }
      ${disabled ? "opacity-40 pointer-events-none" : ""}
    `}
  >
    {children}
  </button>
);

const Sep = () => <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;

// ─────────────────────────────── Callout Boxes ───────────────────────────────

const BOXES = [
  { id: "tip",     label: "💡 Tip",     bg: "#FEF9C3", border: "#FDE047", text: "#713F12" },
  { id: "example", label: "📝 Example", bg: "#F0FDF4", border: "#86EFAC", text: "#14532D" },
  { id: "warning", label: "⚠️ Warning", bg: "#FEF2F2", border: "#FCA5A5", text: "#7F1D1D" },
  { id: "info",    label: "ℹ️ Info",    bg: "#EFF6FF", border: "#93C5FD", text: "#1E3A8A" },
  { id: "formula", label: "🔢 Formula", bg: "#FAF5FF", border: "#C4B5FD", text: "#4C1D95" },
];

// ─────────────────────────────── Main Component ──────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing your chapter content here...",
  minHeight = 400,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: { HTMLAttributes: { class: "rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto" } },
        blockquote: { HTMLAttributes: { class: "border-l-4 border-primary/40 pl-4 italic text-muted-foreground" } },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: "max-w-full h-auto rounded-xl my-3" } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline underline-offset-2" } }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      CharacterCount,
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: false, HTMLAttributes: { class: "border-collapse w-full my-3" } }),
      TableRow,
      TableHeader.configure({ HTMLAttributes: { class: "bg-muted font-semibold border border-border px-3 py-2 text-left text-sm" } }),
      TableCell.configure({ HTMLAttributes: { class: "border border-border px-3 py-2 text-sm" } }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none dark:prose-invert focus:outline-none px-4 py-3",
        style: `min-height:${minHeight}px`,
      },
    },
  });

  // Sync external value changes (e.g. when loading an existing chapter)
  useEffect(() => {
    if (!editor) return;
    const currentHTML = editor.getHTML();
    if (value !== currentHTML) {
      // Only update if significantly different to avoid cursor jumping
      editor.commands.setContent(value || "", false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const addImage = useCallback(() => {
    const url = prompt("Image URL:");
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const addLink = useCallback(() => {
    const url = prompt("URL:", editor?.getAttributes("link").href || "");
    if (url === null) return;
    if (url === "") { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertCallout = useCallback((boxId: string) => {
    const box = BOXES.find(b => b.id === boxId);
    if (!box || !editor) return;
    editor.chain().focus().insertContent(
      `<div style="background:${box.bg};border-left:4px solid ${box.border};padding:14px 16px;border-radius:8px;margin:12px 0;color:${box.text}">${box.label}: Write here...</div>`
    ).run();
  }, [editor]);

  if (!editor) return null;

  const charCount = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div className="rounded-xl border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap gap-0.5 p-2 border-b border-border bg-secondary/40 sticky top-0 z-10">
        {/* History */}
        <ToolBtn title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo className="w-3.5 h-3.5" />
        </ToolBtn>
        <Sep />

        {/* Headings */}
        <ToolBtn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="w-3.5 h-3.5" />
        </ToolBtn>
        <Sep />

        {/* Inline formatting */}
        <ToolBtn title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Subscript" active={editor.isActive("subscript")} onClick={() => editor.chain().focus().toggleSubscript().run()}>
          <SubscriptIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Superscript" active={editor.isActive("superscript")} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
          <SuperscriptIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <Sep />

        {/* Color + Highlight */}
        <label title="Text Color" className="inline-flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Type className="w-3.5 h-3.5" />
          <input type="color" className="sr-only" defaultValue="#000000"
            onChange={e => editor.chain().focus().setColor(e.target.value).run()} />
        </label>
        <ToolBtn title="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: "#FDE68A" }).run()}>
          <Highlighter className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().run()}>
          <RemoveFormatting className="w-3.5 h-3.5" />
        </ToolBtn>
        <Sep />

        {/* Alignment */}
        <ToolBtn title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify className="w-3.5 h-3.5" />
        </ToolBtn>
        <Sep />

        {/* Lists */}
        <ToolBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolBtn>
        <Sep />

        {/* Block elements */}
        <ToolBtn title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="w-3.5 h-3.5" />
        </ToolBtn>
        <Sep />

        {/* Insert */}
        <ToolBtn title="Insert link" active={editor.isActive("link")} onClick={addLink}>
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Insert image (URL)" onClick={addImage}>
          <ImageIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon className="w-3.5 h-3.5" />
        </ToolBtn>
      </div>

      {/* ── Callout Box Buttons ── */}
      <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border bg-secondary/20">
        <span className="text-[10px] font-semibold text-muted-foreground self-center mr-1">Callout:</span>
        {BOXES.map(b => (
          <button
            key={b.id}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); insertCallout(b.id); }}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors hover:opacity-80"
            style={{ background: b.bg, borderColor: b.border, color: b.text }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* ── Editor Content ── */}
      <EditorContent editor={editor} />

      {/* ── Bubble Menu (selection toolbar) ── */}
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}
          className="flex gap-0.5 bg-popover border border-border rounded-xl shadow-lg px-2 py-1.5">
          <ToolBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn title="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: "#FDE68A" }).run()}>
            <Highlighter className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn title="Link" active={editor.isActive("link")} onClick={addLink}>
            <LinkIcon className="w-3.5 h-3.5" />
          </ToolBtn>
        </BubbleMenu>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/20 text-[11px] text-muted-foreground">
        <span>{charCount.toLocaleString()} characters</span>
        <span className="text-green-600 dark:text-green-400 font-semibold">WYSIWYG Editor</span>
      </div>
    </div>
  );
}

export default RichTextEditor;
