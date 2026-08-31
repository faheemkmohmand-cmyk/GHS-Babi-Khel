import { motion } from "framer-motion";

interface PageBannerProps {
  title: string;
  subtitle?: string;
  /**
   * Optional content rendered INSIDE the banner, anchored to the banner's
   * bottom edge (horizontally centred, flush with the bottom edge line).
   * Used for inline actions (e.g. the "Report Card" button on /results)
   * that should visually belong to the green hero banner itself.
   */
  children?: React.ReactNode;
}

const PageBanner = ({ title, subtitle, children }: PageBannerProps) => (
  <div
    className={`gradient-hero relative overflow-visible ${
      // When children exist, the extra bottom padding (pb-10 md:pb-12)
      // reserves room for them BELOW the subtitle and ABOVE the banner's
      // bottom edge, so they can never overlap the subtitle text. The child
      // itself is anchored flush to the bottom edge (see the absolute
      // wrapper below), so its bottom edge touches the banner's edge line.
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

    {/* Children are anchored to the BOTTOM edge of the green banner:
        horizontally centred, with the element's bottom edge exactly flush
        against the banner's bottom edge line (no floating gap, no overlap
        with the subtitle above). The reserved pb-10 md:pb-12 on the banner
        guarantees clearance between the subtitle and this element. */}
    {children && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-4"
      >
        {children}
      </motion.div>
    )}
  </div>
);

export default PageBanner;
