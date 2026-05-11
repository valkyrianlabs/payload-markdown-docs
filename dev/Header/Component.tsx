import type { HeaderData } from './config'

import { getCachedGlobal } from '../utilities/getGlobals'
import { HeaderClient } from './Component.client'

export async function Header() {
  const headerData: HeaderData = await getCachedGlobal('header', 3)()

  return <HeaderClient data={headerData} />
}
