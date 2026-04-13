import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: process.env.NEXT_PUBLIC_PLANNER_TITLE || "Studio Lotus Planner",
  description: "Project control workspace for Studio Lotus",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
