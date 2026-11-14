import { copy } from "@/content/ui";
import { Barlow, Barlow_Semi_Condensed } from 'next/font/google';
import { AppProvider } from '@/components/AppProvider';
import Header from '@/components/Header';
import Shell from '@/components/Shell';
import { disclaimer } from '@/content/sources';
import '@/styles/tokens.css';
import '@/styles/globals.css';
const body = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body'
});
const numbers = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-numbers'
});
export const metadata = {
  title: copy.app_layout.crew_health_monitor,
  description: copy.app_layout.onboard_crew_health_patterns_checkins_and
};
export default function RootLayout({
  children
}) {
  return <html lang="en" className={`${body.variable} ${numbers.variable}`}><body><a className="skip-link" href="#main-content">{copy.app_layout.skip_to_content}</a><AppProvider><Header /><Shell>{children}</Shell><footer>{disclaimer}<span>{copy.app_layout.crew_health_monitor_space_apps_2026}</span></footer></AppProvider></body></html>;
}
