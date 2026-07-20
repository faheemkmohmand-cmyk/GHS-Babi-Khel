import { motion } from "framer-motion";

interface PageBannerProps {
  title: string;
  subtitle?: string;
}

const PageBanner = ({ title, subtitle }: PageBannerProps) => (
  <div className="gradient-hero py-10 md:py-12 relative overflow-hidden">
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
  </div>
);

export default PageBanner;
