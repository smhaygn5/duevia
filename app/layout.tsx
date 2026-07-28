import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0];
  const rawHost = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(rawHost)
    ? rawHost
    : "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0] ??
    (host.startsWith("localhost") ? "http" : "https");
  const socialImage = new URL("/og.png", `${protocol}://${host}`).toString();
  const description =
    "Milestone agreements, USDC escrow, delivery, and settlement for global service work.";

  return {
    title: {
      default: "Duevia — Work in stages. Settle globally.",
      template: "%s - Duevia",
    },
    description,
    icons: {
      icon: [
        {
          url: "/favicon-dark.svg",
          type: "image/svg+xml",
          media: "(prefers-color-scheme: dark)",
        },
        {
          url: "/favicon-light.svg",
          type: "image/svg+xml",
          media: "(prefers-color-scheme: light)",
        },
      ],
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Duevia — Work in stages. Settle globally.",
      description,
      type: "website",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "Duevia milestone settlement path",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Duevia — Work in stages. Settle globally.",
      description,
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#020618",
};

const themeScript = `
  (() => {
    try {
      const storedTheme = localStorage.getItem("duevia-theme");
      const systemTheme = matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
      const theme =
        storedTheme === "light" || storedTheme === "dark"
          ? storedTheme
          : systemTheme;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      document.documentElement.dataset.theme = "dark";
      document.documentElement.style.colorScheme = "dark";
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
