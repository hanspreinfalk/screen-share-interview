import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist_Mono, Libre_Baskerville } from "next/font/google";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { StoreUser } from "@/components/store-user";
import { cn } from "@/lib/utils";
import "./globals.css";

const baskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-baskerville",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pacific, Workflow Consultant",
  description:
    "Live AI systems architect that watches your workflow and designs autonomous agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        baskerville.variable,
        geistMono.variable,
      )}
    >
      <body className="flex min-h-full flex-col bg-white text-[#171719]">
        <ClerkProvider>
          <ConvexClientProvider>
            <StoreUser />
            {children}
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}