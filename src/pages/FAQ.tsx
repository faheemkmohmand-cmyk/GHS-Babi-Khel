import { motion } from "framer-motion";

interface PageBannerProps {
  title: string;
  subtitle?: string;
  /**
   * Optional content rendered inside the banner, below the subtitle.
   * Useful for inline actions (e.g. a "Report Card" button) that should
   * sit on the green hero banner rather than below it.
   */
  children?: React.ReactNode;
}

const PageBanner = ({ title, subtitle, children }: PageBannerProps) => (
  <div
    className={`gradient-hero relative overflow-visible ${
      // Banner box only ever wraps the title/subtitle. It does NOT grow to
      // contain the card — the card is pulled up on top of it afterwards
      // with a negative margin, so the green area always ends right after
      // the subtitle, never stretching down the height of the card.
      children ? "pt-10 md:pt-12 pb-10 md:pb-12" : "py-10 md:py-12"
    }`}
  >
    <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/10 pointer-events-none" />
    <div className="container mx-auto px-4 text-center relative z-10">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-4xl font-heading font-bold text-primary-foreground tracking-tight"
      >
        {title}
      </motion.h1>
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.1 }}
        className="mx-auto mt-3 h-[3px] w-14 rounded-full bg-gold"
      />
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-3 text-primary-foreground/80 text-sm md:text-base max-w-xl mx-auto"
        >
          {subtitle}
        </motion.p>
      )}
    </div>

    {/* Card renders OUTSIDE the green box (as a sibling, after it closes)
        and is pulled up over the seam with a negative top margin — this is
        what actually keeps the green area short, unlike padding the parent
        which just grows the green box to match the card's height. */}
    {children && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="container mx-auto px-4 relative z-10 flex justify-center -mt-8 md:-mt-10"
      >
        {children}
      </motion.div>
    )}
  </div>
);

export default PageBanner;
