import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";

// Behavior:
//  - Hidden while the page is stationary (no scrolling happening).
//  - Appears the moment the user scrolls, and auto-hides ~900ms after
//    scrolling stops.
//  - While scrolling DOWN, it sits at the BOTTOM of the screen.
//  - While scrolling UP, it sits at the TOP of the screen instead — so it's
//    always near where the user's attention/thumb currently is.
//  - Clicking it always scrolls all the way back to the top.
//  - Only shows at all once scrolled past 400px (no point near the top).
const ScrollToTop = () => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const lastScrollY = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastScrollY.current;
      lastScrollY.current = y;

      if (y > 400) {
        setPosition(goingDown ? "bottom" : "top");
        setVisible(true);
      } else {
        setVisible(false);
      }

      // Reset the auto-hide timer on every scroll event
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 900);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key={position}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={`fixed right-6 z-40 w-11 h-11 rounded-full gradient-accent text-primary-foreground shadow-elevated flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ${
            position === "bottom" ? "bottom-28 lg:bottom-6" : "top-20"
          }`}
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default ScrollToTop;
