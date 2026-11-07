import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvestSync Virtual Fund",
  description: "A paper portfolio for InvestSync",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
