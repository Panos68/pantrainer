import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Chakra_Petch } from "next/font/google";
import { Toaster } from "sonner";
import MobileBottomNav from "@/components/MobileBottomNav";
import { parseSession } from "@/lib/auth";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const session = await parseSession(cookieStore.get("auth")?.value);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${chakraPetch.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 pb-20 md:pb-0">
        {children}
        <MobileBottomNav role={session?.role ?? null} />
        <Toaster position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
