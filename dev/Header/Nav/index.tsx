'use client'

import React, { useRef, useState } from 'react'

import type { HeaderData, HeaderNavItem, HeaderSubItem } from '../config.js'

import { CMSLink } from '../../components/Link/index.js'

const cx = (...classes: (false | null | string | undefined)[]) => classes.filter(Boolean).join(' ')

export const HeaderNav: React.FC<{ data: HeaderData }> = ({ data }) => {
  const navItems = data?.navItems || []

  return (
    <nav className="flex items-center">
      <ul className="m-0 flex list-none items-center gap-2 p-0">
        {navItems.map((item, i) => (
          <TopNavItem item={item} key={i} />
        ))}
      </ul>
    </nav>
  )
}

const TopNavItem: React.FC<{ item: HeaderNavItem }> = ({ item }) => {
  const [open, setOpen] = useState(false)
  const closeTimeout = useRef<NodeJS.Timeout | null>(null)
  const subItems = item.subItems || []
  const hasSubItems = subItems.length > 0

  const clearCloseTimeout = () => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current)
      closeTimeout.current = null
    }
  }

  const handleOpen = () => {
    clearCloseTimeout()
    setOpen(true)
  }

  const handleClose = () => {
    clearCloseTimeout()
    closeTimeout.current = setTimeout(() => setOpen(false), 120)
  }

  if (!hasSubItems) {
    return (
      <li className="list-none">
        <CMSLink
          {...item.link}
          appearance="inline"
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-foreground"
        />
      </li>
    )
  }

  return (
    <li className="relative list-none" onMouseEnter={handleOpen} onMouseLeave={handleClose}>
      <div className="inline-flex items-center rounded-md transition hover:bg-accent">
        <CMSLink
          {...item.link}
          appearance="inline"
          className="inline-flex items-center rounded-l-md pl-3 pr-1 py-2 text-sm font-medium transition hover:text-foreground"
        />

        <button
          aria-expanded={open}
          aria-label={`Toggle ${item.link?.label || 'submenu'}`}
          className="inline-flex items-center justify-center rounded-r-md pr-2 pl-1 py-2 text-muted-foreground transition hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <span aria-hidden="true" className={cx('text-xs transition', open && 'rotate-180')}>
            v
          </span>
        </button>
      </div>

      <div
        className={cx(
          'absolute right-0 top-full z-50 mt-2 hidden min-w-36 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background p-2 shadow-xl',
          open && 'block',
        )}
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {subItems.map((subItem, i) => (
            <SubNavItem item={subItem} key={i} />
          ))}
        </ul>
      </div>
    </li>
  )
}

const SubNavItem: React.FC<{ item: HeaderSubItem }> = ({ item }) => {
  const [open, setOpen] = useState(false)
  const closeTimeout = useRef<NodeJS.Timeout | null>(null)
  const childItems = item.childItems || []
  const hasChildItems = childItems.length > 0

  const clearCloseTimeout = () => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current)
      closeTimeout.current = null
    }
  }

  const handleOpen = () => {
    clearCloseTimeout()
    setOpen(true)
  }

  const handleClose = () => {
    clearCloseTimeout()
    closeTimeout.current = setTimeout(() => setOpen(false), 120)
  }

  if (!hasChildItems) {
    return (
      <li className="list-none">
        <CMSLink
          {...item.link}
          appearance="inline"
          className="block rounded-md px-3 py-2 text-sm whitespace-nowrap transition hover:bg-accent hover:text-foreground"
        />
      </li>
    )
  }

  return (
    <li className="relative list-none" onMouseEnter={handleOpen} onMouseLeave={handleClose}>
      <div className="flex items-center rounded-md transition hover:bg-accent">
        <CMSLink
          {...item.link}
          appearance="inline"
          className="block rounded-l-md px-3 py-2 text-sm whitespace-nowrap transition hover:text-foreground"
        />

        <button
          aria-expanded={open}
          aria-label={`Toggle ${item.link?.label || 'submenu'}`}
          className="inline-flex items-center justify-center rounded-r-md pr-2 pl-1 py-2 text-muted-foreground transition hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <span aria-hidden="true" className={cx('text-xs transition', open && 'rotate-90')}>
            &gt;
          </span>
        </button>
      </div>

      <div
        className={cx(
          'absolute left-full top-0 z-50 ml-2 hidden min-w-64 rounded-xl border border-border bg-background p-2 shadow-xl',
          open && 'block',
        )}
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {childItems.map((childItem, i) => (
            <li className="list-none" key={i}>
              <CMSLink
                {...childItem.link}
                appearance="inline"
                className="block rounded-md px-3 py-2 text-sm whitespace-nowrap transition hover:bg-accent hover:text-foreground"
              />
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}
