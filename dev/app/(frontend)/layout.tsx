import '../globals.css'

import type { Metadata } from 'next'

import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  description: 'Documentation site built with payload-markdown-docs',
  title: {
    default: 'payload-markdown-docs',
    template: '%s | payload-markdown-docs',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark" lang="en" suppressHydrationWarning>
      <body
        className={[
          inter.variable,
          'font-sans antialiased',
          'bg-background text-foreground',
          'min-h-screen',
        ].join(' ')}
      >
        <div className="flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  )
}
