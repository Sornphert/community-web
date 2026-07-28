'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { ContentItem, LessonFolder } from '@/lib/types'
import { ContentRow } from './content-row'

type Node = { folder: LessonFolder; children: Node[]; lessons: ContentItem[] }
type Tree = { rootLessons: ContentItem[]; folders: Node[] }

// Member-facing nested lesson tree (0039). Folders collapse/expand; lessons link to
// the content viewer. Mirrors the admin structure minus the editing controls.
export function MemberLessonTree({
  tree,
  basePath,
  completedIds,
}: {
  tree: Tree
  basePath: string
  completedIds: string[]
}) {
  const done = new Set(completedIds)
  return (
    <div className="flex flex-col gap-2">
      {tree.folders.map((node) => (
        <FolderNode
          key={node.folder.id}
          node={node}
          basePath={basePath}
          done={done}
        />
      ))}
      {tree.rootLessons.map((item) => (
        <Link key={item.id} href={`${basePath}/content/${item.id}`}>
          <ContentRow item={item} completed={done.has(item.id)} />
        </Link>
      ))}
    </div>
  )
}

function FolderNode({
  node,
  basePath,
  done,
}: {
  node: Node
  basePath: string
  done: Set<string>
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
        )}
        <Folder className="h-4 w-4 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1 truncate font-medium text-fg">
          {node.folder.name}
        </span>
      </button>
      {open && (node.children.length > 0 || node.lessons.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-line py-2 pl-5 pr-2">
          {node.children.map((child) => (
            <FolderNode
              key={child.folder.id}
              node={child}
              basePath={basePath}
              done={done}
            />
          ))}
          {node.lessons.map((item) => (
            <Link key={item.id} href={`${basePath}/content/${item.id}`}>
              <ContentRow item={item} completed={done.has(item.id)} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
