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
      // Extra bottom padding when there's embedded content (e.g. a status
      // card) so it has real breathing room ABOVE the banner's bottom edge
      // instead of sitting flush against the seam with the page background.
      children ? "pt-10 md:pt-12 pb-14 md:pb-16" : "py-10 md:py-12"
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
      {children && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          // Card floats half on/half off the banner's bottom edge, centred
          // on the seam rather than clipped flush against it.
          className="mt-6 md:mt-7 flex justify-center relative -mb-16 md:-mb-20"
        >
          {children}
        </motion.div>
      )}
    </div>
  </div>
);

export default PageBanner;
