"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BottomNav } from "@/components/ui/bottom-nav";
import Footer from "@/components/ui/footer";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Determine active tab based on current path
  const getActiveTab = useCallback(() => {
    if (pathname === "/") return "feed";
    if (pathname.startsWith("/map")) return "map";
    if (pathname.startsWith("/upload")) return "upload";
    if (pathname.startsWith("/profile")) return "profile";
    return "feed";
  }, [pathname]);
  
  const [activeTab, setActiveTab] = useState(getActiveTab());

  useEffect(() => {
    setActiveTab(getActiveTab());
  }, [getActiveTab]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    
    // Navigate to the corresponding page
    switch (tab) {
      case "feed":
        router.push("/");
        break;
      case "map":
        router.push("/map");
        break;
      case "upload":
        router.push("/upload");
        break;
      case "profile":
        router.push("/profile");
        break;
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <Footer />
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
