import type { ReactNode } from 'react'

import type { GetPayloadMarkdownDocsNavItemsOptions, PayloadMarkdownDocsNavItem } from './links.js'

import { isRouteDescendant, normalizeRoutePath } from '../routing/index.js'
import { getPayloadMarkdownDocsNavItems } from './links.js'

export type PayloadMarkdownDocsNavbarClassNames = {
  activeLink?: string
  childrenList?: string
  item?: string
  link?: string
  list?: string
  panel?: string
  root?: string
  trigger?: string
}

export type PayloadMarkdownDocsNavbarRenderLinkOptions = {
  active: boolean
  children: ReactNode
  className: string
  current: boolean
  href: string
  item: PayloadMarkdownDocsNavItem
}

export type PayloadMarkdownDocsNavbarProps = {
  ariaLabel?: string
  classNames?: PayloadMarkdownDocsNavbarClassNames
  currentPath?: string
  items?: PayloadMarkdownDocsNavItem[]
  renderLink?: (options: PayloadMarkdownDocsNavbarRenderLinkOptions) => ReactNode
} & Partial<GetPayloadMarkdownDocsNavItemsOptions>

const cx = (...values: (false | null | string | undefined)[]): string =>
  values.filter(Boolean).join(' ')

const defaultClassNames = {
  activeLink: 'bg-cyan-400/10 text-cyan-200',
  childrenList: 'space-y-1',
  item: 'relative list-none',
  link: 'block rounded-lg px-3 py-2 text-sm leading-5 text-foreground/70 transition-colors hover:bg-white/[0.04] hover:text-foreground',
  list: 'm-0 flex list-none items-center gap-1 p-0',
  panel:
    'absolute left-0 top-full z-50 hidden min-w-60 rounded-xl border border-border bg-background p-2 shadow-xl group-hover:block group-focus-within:block',
  root: 'relative',
  trigger:
    'block rounded-lg px-3 py-2 text-sm leading-5 text-foreground/60 transition-colors group-hover:bg-white/[0.04] group-hover:text-foreground',
} satisfies Required<PayloadMarkdownDocsNavbarClassNames>

const isItemActive = ({
  currentPath,
  item,
}: {
  currentPath?: string
  item: PayloadMarkdownDocsNavItem
}): boolean => {
  if (!currentPath) {
    return false
  }

  if (item.url) {
    const normalizedUrl = normalizeRoutePath(item.url)

    if (currentPath === normalizedUrl || isRouteDescendant(normalizedUrl, currentPath)) {
      return true
    }
  }

  return (item.children ?? []).some((child) =>
    isItemActive({
      currentPath,
      item: child,
    }),
  )
}

const isItemCurrent = ({
  currentPath,
  item,
}: {
  currentPath?: string
  item: PayloadMarkdownDocsNavItem
}): boolean => Boolean(currentPath && item.url && currentPath === normalizeRoutePath(item.url))

const renderDefaultLink = ({
  children,
  className,
  current,
  href,
}: PayloadMarkdownDocsNavbarRenderLinkOptions) => (
  <a aria-current={current ? 'page' : undefined} className={className} href={href}>
    {children}
  </a>
)

const renderNavItems = ({
  classNames,
  currentPath,
  depth = 0,
  items,
  renderLink = renderDefaultLink,
}: {
  classNames: PayloadMarkdownDocsNavbarClassNames
  currentPath?: string
  depth?: number
  items: PayloadMarkdownDocsNavItem[]
  renderLink?: (options: PayloadMarkdownDocsNavbarRenderLinkOptions) => ReactNode
}): ReactNode => {
  if (items.length === 0) {
    return null
  }

  return (
    <ul className={cx(depth === 0 ? classNames.list : classNames.childrenList)}>
      {items.map((item) => {
        const active = isItemActive({
          currentPath,
          item,
        })
        const current = isItemCurrent({
          currentPath,
          item,
        })
        const linkClassName = cx(classNames.link, active && classNames.activeLink)
        const children = item.children?.length
          ? renderNavItems({
              classNames,
              currentPath,
              depth: depth + 1,
              items: item.children,
              renderLink,
            })
          : null

        return (
          <li className={cx('group', classNames.item)} key={`${item.collection}:${item.id}`}>
            {item.url ? (
              renderLink({
                active,
                children: item.label,
                className: linkClassName,
                current,
                href: item.url,
                item,
              })
            ) : (
              <span className={cx(classNames.trigger, active && classNames.activeLink)}>
                {item.label}
              </span>
            )}
            {children ? <div className={classNames.panel}>{children}</div> : null}
          </li>
        )
      })}
    </ul>
  )
}

export const PayloadMarkdownDocsNavbar = async ({
  ariaLabel = 'Docs navigation',
  classNames,
  currentPath,
  items,
  renderLink,
  ...options
}: PayloadMarkdownDocsNavbarProps) => {
  const navItems =
    items ??
    (options.payload
      ? await getPayloadMarkdownDocsNavItems({
          ...options,
          payload: options.payload,
        })
      : [])

  if (navItems.length === 0) {
    return null
  }

  const mergedClassNames = {
    ...defaultClassNames,
    ...classNames,
  }

  return (
    <nav aria-label={ariaLabel} className={mergedClassNames.root}>
      {renderNavItems({
        classNames: mergedClassNames,
        currentPath: currentPath ? normalizeRoutePath(currentPath) : undefined,
        items: navItems,
        renderLink,
      })}
    </nav>
  )
}
