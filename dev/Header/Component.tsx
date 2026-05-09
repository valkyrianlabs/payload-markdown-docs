import type { HeaderData } from './config.js'

import { getCachedGlobal } from '../utilities/getGlobals.js'
import { HeaderClient } from './Component.client.js'

export async function Header() {
  const headerData: HeaderData = await getCachedGlobal('header', 3)()

  return <HeaderClient data={headerData} />
}
