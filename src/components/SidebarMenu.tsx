import { useEffect, useRef, useState } from 'react'
import './SidebarMenu.css'

export type MenuAction = 'logout'

interface Props {
  onAction: (action: MenuAction) => void
}

export function SidebarMenu({ onAction }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(action: MenuAction) {
    setOpen(false)
    onAction(action)
  }

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className={`menu__toggle${open ? ' menu__toggle--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Меню"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <div className={`menu__popup${open ? ' menu__popup--open' : ''}`} role="menu" inert={!open}>
        <button type="button" className="menu__item" role="menuitem" onClick={() => choose('logout')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />
          </svg>
          Выйти
        </button>
      </div>
    </div>
  )
}
