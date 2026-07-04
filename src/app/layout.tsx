import type { Metadata } from "next";
import { Geist, Geist_Mono, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet/useWallet";

const sans = Geist({ variable: "--ff-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--ff-mono", subsets: ["latin"] });
const display = Chakra_Petch({
  variable: "--ff-display",
  weight: ["600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ELEVEN — predict the next goal, settled by TxLINE",
  description:
    "Trustless live-football prediction markets on Solana. Play free, no wallet. Settled on-chain from TxLINE's signed Merkle proofs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} ${display.variable} antialiased`}>
        <WalletProvider>
          <div className="relative z-10">{children}</div>
        </WalletProvider>
      </body>
    </html>
  );
}
