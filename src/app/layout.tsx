import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anything → Arcade",
  description:
    "Upload a scene; a vision model identifies the game hiding in it, Tripo builds the cast, and Three.js stages it playable.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
