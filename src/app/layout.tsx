import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'MoLis Intelligence | The AI That Understands Student Life',
  description:
    'The AI-powered operating system for students — combining study, wellbeing, finance, productivity, and intelligent automation in one platform.',
}

const themeScript = `
(function(){
  try{
    var t=localStorage.getItem('molis-theme');
    var r=document.documentElement;
    r.classList.remove('light','dark');
    if(t==='dark'){r.classList.add('dark');}
    else if(t==='light'){r.classList.add('light');}
    else{if(window.matchMedia('(prefers-color-scheme: dark)').matches){r.classList.add('dark');}}
  }catch(e){}
})();
`.trim()

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground antialiased`}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
