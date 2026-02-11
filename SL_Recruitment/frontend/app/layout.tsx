import "./globals.css";
import { ReactNode } from "react";
import { Roboto } from "next/font/google";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700"],
  display: "swap",
  variable: "--font-primary",
});

export const metadata = {
  title: "SL Recruitment",
  description: "Hiring OS",
  icons: {
    icon: "/Studio Lotus Logo (TM).png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} relative min-h-screen text-slate-900 antialiased`}>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
