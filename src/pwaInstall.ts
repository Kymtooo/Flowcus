import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function usePwaInstall() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true;
    setInstalled(isStandalone());
    const handler = (e: Event) => {
      e.preventDefault?.();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => {
      window.removeEventListener('beforeinstallprompt', handler as any);
    };
  }, []);

  const canInstall = !!event && !installed;
  const promptInstall = async () => {
    if (!event) return false;
    try {
      await event.prompt();
      await event.userChoice;
      setEvent(null);
      return true;
    } catch {
      return false;
    }
  };

  return { canInstall, installed, promptInstall };
}

