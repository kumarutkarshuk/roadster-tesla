import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Describe the two available drives in link previews and search results.
export const metadata: Metadata = {
  title: "Roadster — Beyond the Road",
  description:
    "An endless scenic drive. Explore a green Pacific highway and a neon cyber city, and lift off in a Tesla Roadster-inspired cold-gas flying car.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16212b",
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
