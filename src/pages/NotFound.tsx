import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Home, GraduationCap } from "lucide-react";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";

const NotFound = () => {
  const location = useLocation();
  const { data: settings } = useSchoolSettings();
  const [logoFailed, setLogoFailed] = useState(false);

  // Reset logo failed state when URL changes
  useEffect(() => { setLogoFailed(false); }, [settings?.logo_url]);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        {settings?.logo_url && !logoFailed ? (
          <img src={settings.logo_url} alt="Logo" className="w-16 h-16 rounded-xl object-cover mx-auto mb-6" onError={() => setLogoFailed(true)} />
        ) : (
          <div className="w-16 h-16 rounded-xl gradient-hero flex items-center justify-center mx-auto mb-6">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
        )}
        <h1 className="text-7xl font-heading font-extrabold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent mb-4">
          404
        </h1>
        <h2 className="text-xl font-heading font-bold text-foreground mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-accent text-primary-foreground font-semibold shadow-card hover:shadow-elevated transition-all"
        >
          <Home className="w-4 h-4" />
          Go Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
