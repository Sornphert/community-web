'use client'

import { useRef, useState } from 'react'
import { Avatar } from './avatar'
import { mentionAllToken, mentionToken } from '@/lib/mentions'

export type MentionMember = {
  id: string
  display_name: string
  avatar_url: string | null
}

// A controlled <textarea> with an @-mention autocomplete popover. Typing `@`
// (at the start of a word) opens a member picker; selecting one inserts an
// inline token (see lib/mentions.ts) that the DB triggers parse for
// notifications and MentionText renders as a link. Admins additionally get an
// "Everyone" (@all) option.
//
// The popover matches the display name as a case-insensitive substring over a
// spaceless query — good enough for a ~30-member community.
export function MentionTextarea({
  value,
  onChange,
  members,
  canMentionAll,
  placeholder,
  rows = 3,
  required,
  disabled,
  className,
}: {
  value: string
  onChange: (next: string) => void
  members: MentionMember[]
  canMentionAll: boolean
  placeholder?: string
  rows?: number
  required?: boolean
  disabled?: boolean
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Active query state: null = popover closed. `start` is the index of the '@'.
  const [query, setQuery] = useState<{ text: string; start: number } | null>(
    null,
  )
  const [activeIndex, setActiveIndex] = useState(0)

  const showAll =
    canMentionAll &&
    query !== null &&
    ('everyone'.startsWith(query.text.toLowerCase()) ||
      'all'.startsWith(query.text.toLowerCase()) ||
      query.text === '')

  const matches =
    query === null
      ? []
      : members
          .filter((m) =>
            m.display_name.toLowerCase().includes(query.text.toLowerCase()),
          )
          .slice(0, 6)

  type Option = { kind: 'all' } | { kind: 'member'; member: MentionMember }
  const options: Option[] = [
    ...(showAll ? [{ kind: 'all' as const }] : []),
    ...matches.map((member) => ({ kind: 'member' as const, member })),
  ]

  function refreshQuery(text: string, caret: number) {
    const before = text.slice(0, caret)
    // '@' must start a word (line start or preceded by whitespace); the query
    // captures word-ish chars only — it stops at '[' so existing tokens never
    // re-trigger the popover.
    const m = /(?:^|\s)@([^\s@[\]()]*)$/.exec(before)
    if (m) {
      setQuery({ text: m[1], start: caret - m[1].length - 1 })
      setActiveIndex(0)
    } else {
      setQuery(null)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    onChange(next)
    refreshQuery(next, e.target.selectionStart ?? next.length)
  }

  function applyOption(opt: Option) {
    if (query === null) return
    const caret = ref.current?.selectionStart ?? value.length
    const before = value.slice(0, query.start)
    const after = value.slice(caret)
    const token =
      opt.kind === 'all'
        ? mentionAllToken()
        : mentionToken(opt.member.id, opt.member.display_name)
    const insert = `${token} `
    const next = before + insert + after
    onChange(next)
    setQuery(null)

    const pos = before.length + insert.length
    requestAnimationFrame(() => {
      const el = ref.current
      if (el) {
        el.focus()
        el.setSelectionRange(pos, pos)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      applyOption(options[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery(null)
    }
  }

  const open = query !== null && options.length > 0

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setTimeout(() => setQuery(null), 120)
        }}
        required={required}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />

      {open && (
        <ul className="absolute left-0 top-full z-20 mt-1 max-h-60 w-64 overflow-auto rounded-md border border-line-strong bg-surface py-1 shadow-lg">
          {options.map((opt, i) => {
            const isActive = i === activeIndex
            const key = opt.kind === 'all' ? '__all__' : opt.member.id
            return (
              <li key={key}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applyOption(opt)
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    isActive ? 'bg-muted' : ''
                  }`}
                >
                  {opt.kind === 'all' ? (
                    <>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-fg-secondary">
                        @
                      </span>
                      <span className="font-medium text-fg">Everyone</span>
                      <span className="ml-auto text-xs text-fg-muted">
                        notifies all members
                      </span>
                    </>
                  ) : (
                    <>
                      <Avatar
                        url={opt.member.avatar_url}
                        name={opt.member.display_name}
                        size="sm"
                      />
                      <span className="truncate text-fg">
                        {opt.member.display_name}
                      </span>
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
