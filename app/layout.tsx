import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Libre_Baskerville } from "next/font/google";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { StoreUser } from "@/components/store-user";
import { cn } from "@/lib/utils";
import "./globals.css";

const baskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-baskerville",
});

export const metadata: Metadata = {
  title: "Pacific",
  description: "A friend to talk things through with.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", baskerville.variable)}
    >
      <body
        className="flex min-h-full flex-col overflow-x-hidden bg-white text-black"
        suppressHydrationWarning
      >
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
