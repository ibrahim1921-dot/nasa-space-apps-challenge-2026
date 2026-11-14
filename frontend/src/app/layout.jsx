import { Barlow, Barlow_Semi_Condensed } from 'next/font/google';
import '../styles/theme.css';
import '../styles/app.css';

// theme.css reads these variables in --font-ui and --font-number.
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-barlow',
});

const barlowSemi = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
  variable: '--font-barlow-semi',
});

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232A55C9'/%3E%3Cpath d='M6 17h5l3-7 4 13 3-6h5' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

export const metadata = {
  title: 'Crew health monitor',
  icons: { icon: FAVICON },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowSemi.variable}`}>
      <body>{children}</body>
    </html>
  );
}
