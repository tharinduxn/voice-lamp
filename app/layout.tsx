import type { Metadata } from "next";
import { Geist, Geist_Mono, Protest_Strike } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const protestStrike = Protest_Strike({
  variable: "--font-strike",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DUOTHAN 6.0 — Lamp Voice Control",
  description:
    "Voice-controlled lamp panel for Duothan 6.0 live event. Controls 11 physical lamps over WiFi via ESP32.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${protestStrike.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
