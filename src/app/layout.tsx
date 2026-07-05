import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet/useWallet";

const sans = Inter({ variable: "--ff-sans", subsets: ["latin"] });
const display = Anton({ variable: "--ff-display", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ELEVEN — predict the next goal, settled by TxLINE",
  description:
    "Trustless live-football prediction markets on Solana. Play free, no wallet. Settled on-chain from TxLINE's signed Merkle proofs.",
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
