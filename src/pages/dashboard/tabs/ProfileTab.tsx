import { useState } from "react";
import { User, Lock, Loader2, Camera } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import toast from "react-hot-toast";

const ProfileTab = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [uploading, setUploading] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile updated!");
      refreshProfile();
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated!");
      setNewPassword("");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    let publicUrl: string;
    try {
      publicUrl = await uploadToCloudinary(file, "students");
    } catch {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    toast.success("Photo updated!");
    refreshProfile();
    setUploading(false);
  };

  return (
    <div className="max-w-lg space-y-6">
      {/* Avatar */}
      <div className="bg-card rounded-xl p-6 shadow-card">
        <h3 className="font-heading font-semibold text-foreground mb-4">Profile Photo</h3>
        <div className="flex items-center gap-4">
          <div className="relative">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full gradient-hero flex items-center justify-center text-primary-foreground text-2xl font-heading font-bold">
                {fullName?.charAt(0)?.toUpperCase() || "U"}
              </div>
            )}
            <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary-dark transition-colors">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </label>
          </div>
          <div>
            <p className="font-medium text-foreground">{profile?.full_name || "User"}</p>
            <p className="text-xs text-muted-foreground capitalize">{profile?.role || "user"}</p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-card rounded-xl p-6 shadow-card space-y-4">
        <h3 className="font-heading font-semibold text-foreground">Personal Information</h3>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none" maxLength={100} />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Email</label>
          <input value={user?.email || ""} disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2.5 text-sm text-muted-foreground" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3XX XXXXXXX" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none" />
        </div>
        <button onClick={handleSave} disabled={saving} className="w-full gradient-accent text-primary-foreground font-semibold py-2.5 rounded-lg shadow-card hover:shadow-elevated transition-all flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
        </button>
      </div>

      {/* Password */}
      <div className="bg-card rounded-xl p-6 shadow-card space-y-4">
        <h3 className="font-heading font-semibold text-foreground">Change Password</h3>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 6 chars)" className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none" minLength={6} />
        </div>
        <button onClick={handlePasswordChange} disabled={changingPassword || newPassword.length < 6} className="w-full bg-secondary text-secondary-foreground font-semibold py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
          {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
        </button>
      </div>
    </div>
  );
};

export default ProfileTab;

                                                                                     
