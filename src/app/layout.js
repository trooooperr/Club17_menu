import { Playfair_Display, Josefin_Sans, Libre_Baskerville, Lato } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

const josefin = Josefin_Sans({
  subsets: ["latin"],
  variable: "--font-josefin",
});

const baskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-baskerville",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-lato",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://menu.club17.com"),
  title: "CLUB 17 - Digital Menu",
  applicationName: "CLUB 17 Digital Menu",
  description: "Official digital menu for CLUB 17 Lounge & Bar, Gorakhpur. View handcrafted drinks, bar bites, main courses, and place orders directly from your table.",
  icons: {
    icon: "/favicon.ico",
    apple: "/logo.png"
  },
  openGraph: {
    type: "website",
    siteName: "CLUB 17 Lounge & Bar",
    title: "CLUB 17 | Digital Menu & Table Ordering",
    description: "Official digital menu for CLUB 17 Lounge & Bar, Gorakhpur.",
    images: [{ url: "/logo.png", width: 256, height: 256, alt: "CLUB 17" }]
  }
};

export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning lang="en" className={`${playfair.variable} ${josefin.variable} ${baskerville.variable} ${lato.variable}`}>
      <head>
        <meta name="theme-color" content="#071412" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
