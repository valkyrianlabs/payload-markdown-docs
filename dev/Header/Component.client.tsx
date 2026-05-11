'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import type { HeaderData } from './config'

import { HeaderNav } from './Nav'

interface HeaderClientProps {
  data: HeaderData
}

export const HeaderClient: React.FC<HeaderClientProps> = ({ data }) => {
  const [isTop, setIsTop] = useState(true)

  useEffect(() => {
    const handleScroll = () => {
      setIsTop(window.scrollY === 0)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`fixed z-20 w-full max-w-full px-6 ${isTop ? '' : 'bg-black bg-opacity-70'}`}
    >
      <div
        className={`flex items-center justify-between transition-all duration-300 ${
          isTop ? 'py-6' : 'py-4'
        }`}
      >
        <Link className="text-sm font-semibold tracking-wide text-foreground" href="/">
          Docs
        </Link>
        <HeaderNav data={data} />
      </div>
    </header>
  )
}
