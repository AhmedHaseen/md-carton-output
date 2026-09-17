import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/navigation";
import { Toaster } from "react-hot-toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MD Carton Output System",
  description:
    "Digital system for tracking hourly Metal Detector carton output in the Finished Good Warehouse",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

import Providers from "@/components/providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col lg:flex-row bg-slate-50 text-slate-900 overflow-x-hidden">
        <Providers>
          <Navigation />
          <main className="flex-1 lg:ml-64 min-h-screen flex flex-col w-full min-w-0 overflow-x-hidden">
            <div className="px-3.5 py-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto page-enter flex-1 min-w-0">
              {children}
            </div>
          </main>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: "#0f172a",
                color: "#f1f5f9",
                borderRadius: "14px",
                padding: "12px 18px",
                fontSize: "14px",
                fontWeight: 500,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                maxWidth: "92vw",
              },
              success: {
                iconTheme: { primary: "#22c55e", secondary: "#fff" },
              },
              error: {
                iconTheme: { primary: "#ef4444", secondary: "#fff" },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
