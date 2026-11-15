import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import {
  User,
  Camera,
  MapPin,
  School,
  Monitor,
  Save,
  Lock
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import {
  municipalitiesOfOrigin,
  shsStrands,
  schoolTypes,
  internetAccessOptions
} from '../../utils/helpers';
import toast from 'react-hot-toast';

const profileLabelClass = 'block text-sm font-semibold text-slate-700';
const profileInputClass = 'mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-600';
const profileSectionHeadingClass = 'mb-5 flex items-center border-b border-slate-100 pb-3 text-base font-bold tracking-tight text-slate-900 sm:text-lg';
const MAX_PROFILE_PICTURE_FILE_SIZE = 5 * 1024 * 1024;

const prepareProfilePicture = (file) => new Promise((resolve, reject) => {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = async () => {
    URL.revokeObjectURL(imageUrl);
    try {
      if (image.naturalWidth * image.naturalHeight > 40_000_000) {
        throw new Error('Choose an image with smaller dimensions.');
      }

      const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This image could not be optimized in your browser.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const toBlob = (quality) => new Promise((blobResolve) => {
        canvas.toBlob(blobResolve, 'image/webp', quality);
      });
      let blob;
      for (const quality of [0.86, 0.72, 0.58]) {
        blob = await toBlob(quality);
        if (blob && blob.size <= 700 * 1024) break;
      }
      if (!blob || blob.size > 700 * 1024) {
        throw new Error('This image is too detailed to optimize. Choose another image.');
      }

      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('This image could not be read.'));
      reader.readAsDataURL(blob);
    } catch (error) {
      reject(error);
    }
  };

  image.onerror = () => {
    URL.revokeObjectURL(imageUrl);
    reject(new Error('This image could not be opened. Choose a JPG, PNG, or WebP file.'));
  };
  image.src = imageUrl;
});

export const RespondentProfile = () => {
  const { user, profilePictureUrl, updateProfile, uploadProfilePicture, changePassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedReturnTo = searchParams.get('returnTo') || '';
  const assessmentReturnTo = /^\/respondent\/assessments\/\d+\/take$/.test(requestedReturnTo) ? requestedReturnTo : '';
  const isRespondent = user?.role === 'respondent';
  const [loading, setLoading] = useState(false);
  const [pictureUploading, setPictureUploading] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasScrollableContent, setHasScrollableContent] = useState(false);
  const pictureInputRef = useRef(null);
  const [profileData, setProfileData] = useState(() => ({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    age: user?.profile?.age || '',
    sex: user?.profile?.sex || '',
    municipality: user?.profile?.municipality || '',
    barangay: user?.profile?.barangay || '',
    junior_high_school: user?.profile?.junior_high_school || '',
    junior_high_school_type: user?.profile?.junior_high_school_type || '',
    senior_high_school: user?.profile?.senior_high_school || '',
    senior_high_school_type: user?.profile?.senior_high_school_type || '',
    shs_strand: user?.profile?.shs_strand || '',
    monthly_family_income_amount: user?.profile?.monthly_family_income_amount ?? '',
    has_computer_at_home: user?.profile?.has_computer_at_home ?? '',
    internet_access_type: user?.profile?.internet_access_type || '',
  }));

  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  useEffect(() => {
    const updateScrollProgress = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      setHasScrollableContent(scrollableHeight > 8);
      setScrollProgress(scrollableHeight > 8
        ? Math.min(100, Math.round((window.scrollY / scrollableHeight) * 100))
        : 0);
    };

    updateScrollProgress();
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress);
    return () => {
      window.removeEventListener('scroll', updateScrollProgress);
      window.removeEventListener('resize', updateScrollProgress);
    };
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const accountDetails = { first_name: profileData.first_name, last_name: profileData.last_name };
    const result = await updateProfile(isRespondent ? {
      ...profileData,
      ...accountDetails,
      age: profileData.age ? parseInt(profileData.age) : null,
      monthly_family_income_amount: profileData.monthly_family_income_amount === '' ? null : parseInt(profileData.monthly_family_income_amount),
      has_computer_at_home: profileData.has_computer_at_home === '' ? null : parseInt(profileData.has_computer_at_home),
    } : accountDetails);
    setLoading(false);
    if (result?.success && assessmentReturnTo) navigate(assessmentReturnTo);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwordData.new_password.length < 10) {
      toast.error('New password must be at least 10 characters');
      return;
    }

    const res = await changePassword(passwordData.current_password, passwordData.new_password);
    if (res.success) {
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    }
  };

  const handleProfilePictureSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_PROFILE_PICTURE_FILE_SIZE) {
      toast.error('Choose an image smaller than 5 MB.');
      return;
    }

    setPictureUploading(true);
    try {
      const image = await prepareProfilePicture(file);
      await uploadProfilePicture(image);
    } catch (error) {
      toast.error(error.message || 'This image could not be processed.');
    } finally {
      setPictureUploading(false);
    }
  };

  return (
    <div className="dlas-respondent-profile mx-auto w-full max-w-[1440px] space-y-7 pb-12 2xl:space-y-8">
      {hasScrollableContent && (
        <div
          className="fixed bottom-0 right-0 top-16 z-40 w-1 overflow-hidden bg-slate-200/80 lg:top-[5.25rem]"
          role="progressbar"
          aria-label={isRespondent ? 'Student profile reading progress' : 'Account settings reading progress'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={scrollProgress}
          aria-valuetext={`${scrollProgress}% of the page viewed`}
        >
          <div className="w-full rounded-full bg-green-600 transition-[height] duration-150" style={{ height: `${scrollProgress}%` }} />
        </div>
      )}

      <PageHeader
        eyebrow={isRespondent ? 'Part I · Student profile' : 'Account settings'}
        title={isRespondent ? 'Your profile' : 'Your account'}
        description={isRespondent
          ? 'Keep your student, education, and technology access details up to date.'
          : 'Update your account name, profile picture, and password.'}
      />

      {assessmentReturnTo && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-950">
          Your consent is recorded. Complete and save the study profile below to return to the assessment.
        </div>
      )}

      {/* Main Profile Form */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8 2xl:p-10">
        <div className="mb-8 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-green-100 text-xl font-bold text-green-800 shadow-sm sm:h-24 sm:w-24">
              {profilePictureUrl ? (
                <img src={profilePictureUrl} alt={`${user?.first_name || 'Student'} profile`} className="h-full w-full object-cover" />
              ) : (
                <>{user?.first_name?.[0] || ''}{user?.last_name?.[0] || ''}</>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Profile picture</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">Add a photo so your account is easy to recognize.</p>
              <p className="mt-1 text-xs text-slate-500">JPG, PNG, or WebP · up to 5 MB · optimized before saving</p>
            </div>
          </div>
          <div className="sm:shrink-0">
            <input
              ref={pictureInputRef}
              id="profile-picture-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleProfilePictureSelect}
              className="sr-only"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => pictureInputRef.current?.click()}
              disabled={pictureUploading}
              aria-describedby="profile-picture-help"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-green-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              <Camera aria-hidden="true" className="mr-2 h-5 w-5" />
              {pictureUploading ? 'Optimizing and saving…' : profilePictureUrl ? 'Change picture' : 'Add picture'}
            </button>
            <span id="profile-picture-help" className="sr-only">Select a JPG, PNG, or WebP image smaller than 5 megabytes.</span>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-8">
          {/* Personal Info */}
          <div>
            <h3 className={profileSectionHeadingClass}>
              <User className="mr-2 h-5 w-5 text-green-700" />
              <span>{isRespondent ? 'Personal Information' : 'Account Details'}</span>
            </h3>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 2xl:gap-6">
              <div>
                <label htmlFor="profile-first-name" className={profileLabelClass}>First Name</label>
                <input
                  id="profile-first-name"
                  type="text"
                  required
                  value={profileData.first_name}
                  onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })}
                  className={profileInputClass}
                />
              </div>

              <div>
                <label htmlFor="profile-last-name" className={profileLabelClass}>Last Name</label>
                <input
                  id="profile-last-name"
                  type="text"
                  required
                  value={profileData.last_name}
                  onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })}
                  className={profileInputClass}
                />
              </div>

              {isRespondent && <div>
                <label htmlFor="profile-age" className={profileLabelClass}>Age</label>
                <input
                  id="profile-age"
                  type="number"
                  min={15}
                  max={60}
                  required
                  value={profileData.age}
                  onChange={(e) => setProfileData({ ...profileData, age: e.target.value })}
                  placeholder="e.g., 18"
                  className={profileInputClass}
                />
              </div>}

              {isRespondent && <div>
                <label htmlFor="profile-sex" className={profileLabelClass}>Sex</label>
                <select
                  id="profile-sex"
                  required
                  value={profileData.sex}
                  onChange={(e) => setProfileData({ ...profileData, sex: e.target.value })}
                  className={profileInputClass}
                >
                  <option value="">Select an option</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>}
            </div>
          </div>

          {isRespondent && <>
          {/* Geographical Origin */}
          <div>
            <h3 className={profileSectionHeadingClass}>
              <MapPin className="mr-2 h-5 w-5 text-green-700" />
              <span>Municipality & Barangay of Origin</span>
            </h3>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:gap-6">
              <div>
                <label htmlFor="profile-municipality" className={profileLabelClass}>Municipality</label>
                <select
                  id="profile-municipality"
                  required
                  value={profileData.municipality}
                  onChange={(e) => setProfileData({ ...profileData, municipality: e.target.value })}
                  className={profileInputClass}
                >
                  <option value="">Select your municipality</option>
                  {municipalitiesOfOrigin.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="profile-barangay" className={profileLabelClass}>Barangay</label>
                <input
                  id="profile-barangay"
                  type="text"
                  required
                  value={profileData.barangay}
                  onChange={(e) => setProfileData({ ...profileData, barangay: e.target.value })}
                  placeholder="e.g., Barangay Nursery, Masbate City"
                  className={profileInputClass}
                />
              </div>
            </div>
          </div>

          {/* Educational Background */}
          <div>
            <h3 className={profileSectionHeadingClass}>
              <School className="mr-2 h-5 w-5 text-emerald-700" />
              <span>Secondary Education Background</span>
            </h3>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:gap-6">
              <div>
                <label htmlFor="profile-junior-school" className={profileLabelClass}>Junior High School Attended</label>
                <input
                  id="profile-junior-school"
                  type="text"
                  required
                  value={profileData.junior_high_school}
                  onChange={(e) => setProfileData({ ...profileData, junior_high_school: e.target.value })}
                  placeholder="e.g., Masbate National Comprehensive High School"
                  className={profileInputClass}
                />
              </div>

              <div>
                <label htmlFor="profile-junior-school-type" className={profileLabelClass}>Junior High School Type</label>
                <select
                  id="profile-junior-school-type"
                  required
                  value={profileData.junior_high_school_type}
                  onChange={(e) => setProfileData({ ...profileData, junior_high_school_type: e.target.value })}
                  className={profileInputClass}
                >
                  <option value="">Select school type</option>
                  {schoolTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="profile-senior-school" className={profileLabelClass}>Senior High School Attended</label>
                <input
                  id="profile-senior-school"
                  type="text"
                  required
                  value={profileData.senior_high_school}
                  onChange={(e) => setProfileData({ ...profileData, senior_high_school: e.target.value })}
                  placeholder="e.g., Masbate National Comprehensive High School"
                  className={profileInputClass}
                />
              </div>

              <div>
                <label htmlFor="profile-senior-school-type" className={profileLabelClass}>Senior High School Type</label>
                <select
                  id="profile-senior-school-type"
                  required
                  value={profileData.senior_high_school_type}
                  onChange={(e) => setProfileData({ ...profileData, senior_high_school_type: e.target.value })}
                  className={profileInputClass}
                >
                  <option value="">Select school type</option>
                  {schoolTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="profile-strand" className={profileLabelClass}>Senior High School Strand</label>
                <select
                  id="profile-strand"
                  required
                  value={profileData.shs_strand}
                  onChange={(e) => setProfileData({ ...profileData, shs_strand: e.target.value })}
                  className={profileInputClass}
                >
                  <option value="">Select your strand</option>
                  {shsStrands.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Socioeconomic & Technological Access */}
          <div>
            <h3 className={profileSectionHeadingClass}>
              <Monitor className="mr-2 h-5 w-5 text-amber-600" />
              <span>Technological Access & Household Profile</span>
            </h3>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:gap-6">
              <div>
                <label htmlFor="profile-income" className={profileLabelClass}>Monthly Family Income (₱)</label>
                <input
                  id="profile-income"
                  type="number"
                  min="0"
                  max="100000000"
                  step="1"
                  required
                  value={profileData.monthly_family_income_amount}
                  onChange={(e) => setProfileData({ ...profileData, monthly_family_income_amount: e.target.value })}
                  placeholder="Enter amount in pesos"
                  className={profileInputClass}
                />
                <p className="mt-1.5 text-xs text-slate-500">For reporting, amounts are grouped as below ₱10,000, ₱10,000–₱30,000, or above ₱30,000.</p>
              </div>

              <div>
                <label htmlFor="profile-computer" className={profileLabelClass}>Ownership of Computer at Home</label>
                <select
                  id="profile-computer"
                  required
                  value={profileData.has_computer_at_home}
                  onChange={(e) => setProfileData({ ...profileData, has_computer_at_home: parseInt(e.target.value) })}
                  className={profileInputClass}
                >
                  <option value="">Select an option</option>
                  <option value={1}>Yes (Owns PC/Laptop)</option>
                  <option value={0}>No Home Computer</option>
                </select>
              </div>

              <div>
                <label htmlFor="profile-internet" className={profileLabelClass}>Primary Internet Access at Home</label>
                <select
                  id="profile-internet"
                  required
                  value={profileData.internet_access_type}
                  onChange={(e) => setProfileData({ ...profileData, internet_access_type: e.target.value })}
                  className={profileInputClass}
                >
                  <option value="">Select an option</option>
                  {internetAccessOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          </>}

          <div className="profile-save-actions flex justify-end border-t border-slate-100 pt-6">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-12 items-center rounded-xl bg-green-700 px-7 py-3 text-sm font-bold text-white shadow-md shadow-green-700/20 transition-all hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-wait disabled:opacity-60"
            >
              <Save className="w-4 h-4 mr-2" />
              <span>{loading ? 'Saving…' : isRespondent ? 'Save Demographic Profile' : 'Save Account Details'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Change Password Card */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8 2xl:p-10">
        <h3 className={profileSectionHeadingClass}>
          <Lock className="mr-2 h-5 w-5 text-slate-600" />
          <span>Security & Password</span>
        </h3>

        <form onSubmit={handlePasswordSubmit} className="grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:gap-6">
          <div>
            <label htmlFor="current-password" className={profileLabelClass}>Current Password</label>
            <input
              id="current-password"
              type="password"
              required
              value={passwordData.current_password}
              onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
              className={profileInputClass}
            />
          </div>

          <div>
            <label htmlFor="new-password" className={profileLabelClass}>New Password</label>
            <input
              id="new-password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              value={passwordData.new_password}
              onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
              className={profileInputClass}
            />
          </div>

          <div>
            <label htmlFor="confirm-new-password" className={profileLabelClass}>Confirm New Password</label>
            <input
              id="confirm-new-password"
              type="password"
              required
              value={passwordData.confirm_password}
              onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
              className={profileInputClass}
            />
          </div>

          <button
            type="submit"
            className="inline-flex min-h-12 items-center justify-center self-end rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 sm:col-span-2 xl:col-span-3"
          >
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
};

export default RespondentProfile;

