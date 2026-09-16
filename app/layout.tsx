import type { Metadata } from "next";
import { Geist, Geist_Mono, Chakra_Petch } from "next/font/google";
import { Toaster } from "sonner";
import MobileBottomNav from "@/components/MobileBottomNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "PanTrainer",
  description: "Personal training management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${chakraPetch.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 pb-20 md:pb-0">
        {children}
        <MobileBottomNav />
        <Toaster position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
