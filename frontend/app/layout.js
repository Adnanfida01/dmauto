import "../styles/globals.css";
import Navbar from "../components/Navbar";

export const metadata = {
  title: "DMAuto",
  description: "SaaS DM Automation Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <Navbar />
        <main className="p-4">{children}</main>
      </body>
    </html>
  );
}
