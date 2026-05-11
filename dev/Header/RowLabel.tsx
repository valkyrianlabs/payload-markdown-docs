'use client'
import type { RowLabelProps } from '@payloadcms/ui'

import { useRowLabel } from '@payloadcms/ui'

import type { HeaderNavItem } from './config'

export const RowLabel: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<HeaderNavItem>()

  const label = data?.data?.link?.label
    ? `Nav item ${data.rowNumber !== undefined ? data.rowNumber + 1 : ''}: ${data?.data?.link?.label}`
    : 'Row'

  return <div>{label}</div>
}
