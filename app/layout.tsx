import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Batch Image Generator",
  description: "Generate multiple AI images from natural language instructions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
