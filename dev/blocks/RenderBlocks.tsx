import { MarkdownBlockComponent } from '@valkyrianlabs/payload-markdown/server'
import React, { Fragment } from 'react'

import type { Page } from '../payload-types.ts'

import { DocsCTA } from '../../dist/next'

const blockComponents = {
  docsCTA: DocsCTA,
  vlMdBlock: MarkdownBlockComponent,
}

export const RenderBlocks: React.FC<{
  blocks: Page['layout'][0][],
  collectionSlug?: string
}> = (props) => {
  const { blocks, collectionSlug } = props

  const hasBlocks = blocks && Array.isArray(blocks) && blocks.length > 0

  if (hasBlocks) {
    return (
      <Fragment>
        {blocks.map((block, index) => {
          const { blockType } = block

          if (blockType && blockType in blockComponents) {
            const Block = blockComponents[blockType]

            if (Block) {
              return (
                <div className="my-16" key={index}>
                  {/* @ts-expect-error - Need to verify block types more robustly */}
                  <Block {...block} collectionSlug={collectionSlug} />
                </div>
              )
            }
          }
          return null
        })}
      </Fragment>
    )
  }

  return null
}
