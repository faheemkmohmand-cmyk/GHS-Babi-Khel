import { motion } from "framer-motion";
import { lazy, Suspense } from "react";
import { GraduationCap, Target, Eye, MapPin, Calendar, Users, Award, BookOpen, History } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useCountUp } from "@/hooks/useCountUp";
import { Skeleton } from "@/components/ui/skeleton";
const SchoolMap = lazy(() => import("@/components/SchoolMap"));

const CountStat = ({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) => {
  const { count, ref } = useCountUp(value);
  return (
    <div ref={ref} className="bg-card rounded-2xl p-6 shadow-card text-center hover:shadow-elevated transition-shadow">
      <div className="text-3xl font-heading font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
        {count}{suffix}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
};

const About = () => {
  const { data: settings, isLoading } = useSchoolSettings();

  return (
    <PageLayout>
      <PageBanner title="About Our School" subtitle="Learning today, leading tomorrow" />

      {/* Description */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : (
                <>
                  <h2 className="text-3xl font-heading font-bold text-foreground mb-4">
                    {settings?.school_name || "GHS Babi Khel"}
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    {settings?.about_text || settings?.description ||
                      "Established in 2018, GHS Babi Khel is a government high school located in Babi Khel, District Mohmand, Khyber Pakhtunkhwa, Pakistan. The school serves as a beacon of education in the region, providing quality education from Class 6 to Class 10."}
                  </p>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    With an EMIS Code of {settings?.emis_code || "60673"}, our school is officially registered
                    with the Education Management Information System of KPK. We are committed to academic
                    excellence with a remarkable {settings?.pass_percentage || 98}% pass rate.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-6">
                    <div className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm">
                      <MapPin className="w-4 h-4" /> {settings?.address || "District Mohmand"}
                    </div>
                    <div className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm">
                      <Calendar className="w-4 h-4" /> Est. {settings?.established_year || 2018}
                    </div>
                    <div className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm">
                      <GraduationCap className="w-4 h-4" /> EMIS: {settings?.emis_code || "60673"}
                    </div>
                  </div>
                </>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-5"
            >
              {[
                { icon: History, title: "Our History", color: "gradient-hero", text: `Founded in ${settings?.established_year || 2018}, GHS Babi Khel was established to bring quality education to the youth of Babi Khel and surrounding areas in District Mohmand. Since then, we have been steadily growing and producing excellent results.` },
                { icon: Target, title: "Our Mission", color: "gradient-hero", text: "To provide accessible, quality education that empowers students with knowledge, skills, and values to become responsible citizens and future leaders of Pakistan." },
                { icon: Eye, title: "Our Vision", color: "gradient-accent", text: "To be a model government school that sets the standard for academic excellence and character development in District Mohmand." },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-card rounded-2xl p-6 shadow-card"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center`}>
                      <item.icon className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h3 className="font-heading font-semibold text-foreground">{item.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Principal's Message */}
      {!isLoading && (settings?.principal_message || settings?.principal_photo_url) && (
        <section className="py-16 bg-secondary/50">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-10"
            >
              <Users className="w-8 h-8 text-primary mx-auto mb-3" />
              <h2 className="text-2xl font-heading font-bold text-foreground">Principal's Message</h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-card rounded-2xl shadow-card p-6 md:p-10 max-w-4xl mx-auto grid md:grid-cols-[200px_1fr] gap-8 items-start"
            >
              <div className="flex flex-col items-center md:items-start">
                <div className="w-40 h-40 rounded-2xl overflow-hidden shadow-elevated bg-secondary shrink-0">
                  {settings?.principal_photo_url ? (
                    <img
                      src={settings.principal_photo_url}
                      alt={settings?.principal_name || "Principal"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Users className="w-12 h-12" />
                    </div>
                  )}
                </div>
                {settings?.principal_name && (
                  <p className="mt-4 font-heading font-semibold text-foreground text-center md:text-left">
                    {settings.principal_name}
                  </p>
                )}
                <p className="text-sm text-muted-foreground text-center md:text-left">Principal</p>
              </div>

              <div>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {settings?.principal_message}
                </p>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Stats */}
      <section className="py-16 bg-secondary/50">
        <div className="container mx-auto px-4">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-card rounded-2xl p-6 text-center shadow-card">
                  <Skeleton className="h-9 w-20 mx-auto mb-2" />
                  <Skeleton className="h-4 w-16 mx-auto" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CountStat value={settings?.total_students || 500} suffix="+" label="Students" />
              <CountStat value={settings?.total_teachers || 25} suffix="+" label="Teachers" />
              <CountStat value={settings?.pass_percentage || 98} suffix="%" label="Pass Rate" />
              <CountStat value={new Date().getFullYear() - (settings?.established_year || 2018)} suffix="+" label="Years of Service" />
            </div>
          )}
        </div>
      </section>

      {/* Location */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <MapPin className="w-8 h-8 text-primary mx-auto mb-3" />
            <h2 className="text-2xl font-heading font-bold text-foreground mb-2">Our Location</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {settings?.address || "Babi Khel, District Mohmand, KPK, Pakistan"}
            </p>
            {settings?.phone && (
              <p className="text-sm text-muted-foreground mt-2">Phone: {settings.phone}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              Email: {settings?.email || "ghsbabkhel@edu.pk"}
            </p>
          </motion.div>

          {settings?.location_lat && settings?.location_lng ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl overflow-hidden shadow-card border border-border"
            >
              <Suspense fallback={
                <div className="h-[360px] bg-secondary/30 flex items-center justify-center text-sm text-muted-foreground">
                  Loading map…
                </div>
              }>
                <SchoolMap
                  lat={settings.location_lat}
                  lng={settings.location_lng}
                  label={settings.school_name || "School Location"}
                  height={360}
                  zoom={16}
                />
              </Suspense>
              <div className="bg-card px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <span>{settings.address || "Babi Khel, District Mohmand, KPK"}</span>
                </div>
                <div className="flex gap-4">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${settings.location_lat}&mlon=${settings.location_lng}#map=16/${settings.location_lat}/${settings.location_lng}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold text-primary hover:underline"
                  >OpenStreetMap ↗</a>
                  <a
                    href={`https://www.google.com/maps?q=${settings.location_lat},${settings.location_lng}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold text-primary hover:underline"
                  >Google Maps ↗</a>
                </div>
              </div>
            </motion.div>
          ) : null}
        </div>
      </section>
    </PageLayout>
  );
};

export default About;
                      
