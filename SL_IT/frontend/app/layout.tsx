import type { Metadata } from "next";
import { Roboto } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700"],
  display: "swap",
  variable: "--font-primary",
});

export const metadata: Metadata = {
  title: "Studio Lotus Platform",
  description: "Internal enterprise portal",
  icons: {
    icon: "/studio-lotus-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} relative min-h-screen text-slate-900 antialiased`}>
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
