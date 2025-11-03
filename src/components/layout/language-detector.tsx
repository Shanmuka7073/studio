
'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

const regionLanguageMap: Record<string, string> = {
  "Andhra Pradesh": "te-IN",
  "Telangana": "te-IN",
  "Karnataka": "kn-IN",
  "Tamil Nadu": "ta-IN",
  "Kerala": "ml-IN",
  "Maharashtra": "mr-IN",
  "Delhi": "hi-IN",
  "Uttar Pradesh": "hi-IN",
  "Gujarat": "gu-IN",
  "West Bengal": "bn-IN",
};

export function LanguageDetector() {
  const { setLanguage, language } = useAppStore();
  const { toast } = useToast();

  useEffect(() => {
    // Only run this detection logic once on mount
    const storedLang = localStorage.getItem('language');
    if (storedLang) {
        if (language !== storedLang) {
          setLanguage(storedLang);
        }
        return;
    }

    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      setLanguage('en-IN'); // Fallback to English
      return;
    }

    const success = async (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
        const data = await res.json();
        
        const region = data.address?.state || data.address?.city || "India";
        const detectedLang = regionLanguageMap[region] || "en-IN";
        
        setLanguage(detectedLang);

        if (detectedLang !== 'en-IN') {
             toast({
                title: 'Language Detected!',
                description: `App language set to ${detectedLang} based on your region (${region}).`,
            });
        }
       
      } catch (e) {
        console.error("Reverse geocoding failed:", e);
        setLanguage("en-IN"); // Fallback on API error
      }
    };

    const error = () => {
      console.warn("Could not retrieve location. Defaulting to English.");
      setLanguage("en-IN"); // Fallback on permission error
    };

    navigator.geolocation.getCurrentPosition(success, error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures it runs only once.

  return null; // This component does not render anything.
}
