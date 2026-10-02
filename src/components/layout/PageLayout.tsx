import { ReactNode } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";
import ScrollToTop from "../shared/ScrollToTop";

const PageLayout = ({ children }: { children: ReactNode }) => {
  return (
    // Bottom padding = the mobile bottom dock's height (5 icon rows ≈ 52px)
    // + its safe-area inset, so the footer / last section can never hide
    // BEHIND the fixed dock (X-Twitter-style clearance). Desktop (lg+) has
    // no dock, so the padding resets to 0 there.
    <div className="min-h-screen flex flex-col pb-[calc(52px+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <ScrollToTop />
    </div>
  );
};

export default PageLayout;
