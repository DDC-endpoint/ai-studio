import type { Metadata } from 'next'
import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider, themeInitScript } from '@/components/theme/ThemeProvider'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { ToastProvider } from '@/components/providers/ToastProvider'
import './globals.css'

// Folio's code face (DESIGN_SYSTEM.md §5.1). Same family as before; only the
// CSS variable is renamed (Tailwind `font-mono` reads it).
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
})

// Folio display + text faces (change 011). Self-hosted by next/font (NFR-05).
// Instrument Sans is the default sans (Tailwind `font-sans` and `font-text`);
// Fraunces is `font-display`.
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  // the optical-size axis: without it every "opsz" variation setting is ignored
  axes: ['opsz'],
  variable: '--font-display',
  display: 'swap',
  fallback: ['ui-serif', 'Georgia', 'serif'],
})

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'ai-studio',
  description: 'Marketing post generation tool for the Bistec team',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-FOUC: apply saved theme before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${jetbrainsMono.variable} ${fraunces.variable} ${instrumentSans.variable} font-sans`}
      >
        <ThemeProvider>
          <QueryProvider>
            {children}
            <ToastProvider />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
