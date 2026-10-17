import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roadster — Beyond the Road",
  description:
    "An endless scenic drive. Explore the coast, escape to the mountains, and lift off in a Tesla Roadster-inspired cold-gas flying car.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
