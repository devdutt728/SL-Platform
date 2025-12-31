import "./globals.css";
import { ReactNode } from "react";
import { Space_Grotesk } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "SL Recruitment",
  description: "Hiring OS",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.className} relative min-h-screen text-slate-900 antialiased`}>
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-gradient-to-tr from-cyan-400/30 to-violet-400/25 blur-3xl motion-float" />
          <div className="absolute -right-44 -top-36 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-rose-400/20 to-amber-400/18 blur-3xl motion-float-slow" />
          <div className="absolute -bottom-44 -left-36 h-[30rem] w-[30rem] rounded-full bg-gradient-to-tr from-emerald-400/18 to-cyan-400/22 blur-3xl motion-float" />
          <div className="absolute -bottom-52 -right-52 h-[34rem] w-[34rem] rounded-full bg-gradient-to-tr from-violet-400/22 to-blue-400/18 blur-3xl motion-float-slow" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
