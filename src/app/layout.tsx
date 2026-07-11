import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet/useWallet";

const sans = Inter({ variable: "--ff-sans", subsets: ["latin"] });
const display = Anton({ variable: "--ff-display", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ELEVEN — live football betting rooms, demo money",
  description:
    "Live-football prediction rooms on demo money. Pick a match, pay the entry, call the game — winner takes the pot, every result independently verifiable.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} antialiased`}>
        <WalletProvider>
          <div className="relative z-10">{children}</div>
        </WalletProvider>
      </body>
    </html>
  );
}
