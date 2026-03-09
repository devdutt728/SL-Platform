import "./globals.css";
import { ReactNode } from "react";
import { Roboto } from "next/font/google";
import { BasePathGuard } from "@/components/base-path-guard";
import { GlobalUxShell } from "@/components/global-ux-shell";

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
    <html lang="en" className="rec-theme-warm-executive">
      <body className={`${roboto.variable} relative min-h-screen text-slate-900 antialiased`}>
        <GlobalUxShell>
          <BasePathGuard />
          <div className="relative z-10">{children}</div>
        </GlobalUxShell>
      </body>
    </html>
  );
}
