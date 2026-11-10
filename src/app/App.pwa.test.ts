import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json';
import { FakeSpeaker } from '../features/dictation/dictation.fixtures';
import fr from '../i18n/fr.json';
import type { AppUpdates } from '../services/pwa/appUpdates';
import type { InstallHost } from '../services/pwa/installPrompt';
import type { VoiceCatalog, VoiceInfo } from '../services/tts/speaker';
import App from './App.svelte';

/** A network that the test switches off and on. */
function fakeConnectivity(onLine: boolean) {
  const target = new EventTarget();
  const host = {
    navigator: { onLine },
    addEventListener: (type: string, listener: () => void) => {
      target.addEventListener(type, listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      target.removeEventListener(type, listener);
    },
  };
  const go = (online: boolean) => {
    host.navigator.onLine = online;
    target.dispatchEvent(new Event(online ? 'online' : 'offline'));
  };
  return { host, go };
}

/** A browser window that may offer its install prompt. */
function fakeInstallHost(userAgent = 'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile') {
  const target = new EventTarget();
  const host: InstallHost = {
    addEventListener: (type, listener) => {
      target.addEventListener(type, listener);
    },
    removeEventListener: (type, listener) => {
      target.removeEventListener(type, listener);
    },
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent, maxTouchPoints: 5 },
  };
  const prompt = vi.fn(() => Promise.resolve());
  const offer = () => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    target.dispatchEvent(
      Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) }),
    );
  };
  const installed = () => target.dispatchEvent(new Event('appinstalled'));
  return { host, offer, installed, prompt };
}

/** Updates that the test makes ready. */
function fakeUpdates() {
  let ready: (() => void) | undefined;
  const applyUpdate = vi.fn(() => Promise.resolve());
  const updates: AppUpdates = {
    onUpdateReady: (listener) => {
      ready = listener;
    },
    applyUpdate,
  };
  return { updates, applyUpdate, publish: () => ready?.() };
}

function voicesWith(zh: VoiceInfo | undefined, en: VoiceInfo | undefined): VoiceCatalog {
  const report = { voices: [zh, en].filter((voice) => voice !== undefined), chosen: { zh, en } };
  return {
    voiceReport: () => Promise.resolve(report),
    reloadVoices: () => Promise.resolve(report),
  };
}

const ONLINE_ZH: VoiceInfo = { name: 'Google 普通话', lang: 'zh-CN', localService: false };
const ONLINE_EN: VoiceInfo = { name: 'Google UK English', lang: 'en-GB', localService: false };
const LOCAL_EN: VoiceInfo = { name: 'Microsoft Hazel', lang: 'en-GB', localService: true };

const base = (databaseName: string) => ({
  databaseName,
  speaker: new FakeSpeaker(true, true),
  connectivity: fakeConnectivity(true).host,
  installHost: fakeInstallHost().host,
});

describe('App, installed and offline', () => {
  it('shows "Hors ligne" while the device has no network, and hides it when it is back', async () => {
    const network = fakeConnectivity(true);
    render(App, { ...base('app-pwa-offline'), connectivity: network.host });
    const brand = screen.getByRole('banner');
    expect(within(brand).queryByText(fr.pwa.offline)).not.toBeInTheDocument();

    network.go(false);
    expect(await within(brand).findByText(fr.pwa.offline)).toBeVisible();

    network.go(true);
    await vi.waitFor(() => {
      expect(within(brand).queryByText(fr.pwa.offline)).not.toBeInTheDocument();
    });
  });

  it('explains offline that an online voice is silent and that words are written', async () => {
    const network = fakeConnectivity(false);
    render(App, {
      ...base('app-pwa-voice'),
      connectivity: network.host,
      voices: voicesWith(ONLINE_ZH, LOCAL_EN),
    });

    expect(await screen.findByText(fr.pwa.offlineVoice.zh)).toBeVisible();

    network.go(true);
    await vi.waitFor(() => {
      expect(screen.queryByText(fr.pwa.offlineVoice.zh)).not.toBeInTheDocument();
    });
  });

  it('names both languages when both voices need the network', async () => {
    render(App, {
      ...base('app-pwa-voices'),
      connectivity: fakeConnectivity(false).host,
      voices: voicesWith(ONLINE_ZH, ONLINE_EN),
    });

    expect(await screen.findByText(fr.pwa.offlineVoice.both)).toBeVisible();
  });

  it('says nothing about the voices offline when they are on the device', async () => {
    const voiceReport = vi.fn(() =>
      Promise.resolve({ voices: [LOCAL_EN], chosen: { zh: undefined, en: LOCAL_EN } }),
    );
    render(App, {
      ...base('app-pwa-local-voice'),
      connectivity: fakeConnectivity(false).host,
      voices: { voiceReport, reloadVoices: voiceReport },
    });

    await vi.waitFor(() => {
      expect(voiceReport).toHaveBeenCalled();
    });
    expect(screen.queryByText(fr.pwa.offlineVoice.en)).not.toBeInTheDocument();
  });

  it('offers to install the app once the browser allows it, and asks again to keep the data', async () => {
    const user = userEvent.setup();
    const install = fakeInstallHost();
    const requestPersistenceAgain = vi.fn(() => Promise.resolve());
    render(App, {
      ...base('app-pwa-install'),
      installHost: install.host,
      requestPersistenceAgain,
    });
    expect(screen.queryByRole('button', { name: fr.pwa.install })).not.toBeInTheDocument();

    install.offer();
    await user.click(await screen.findByRole('button', { name: fr.pwa.install }));
    expect(install.prompt).toHaveBeenCalledTimes(1);
    install.installed();

    await vi.waitFor(() => {
      expect(requestPersistenceAgain).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('button', { name: fr.pwa.install })).not.toBeInTheDocument();
  });

  it('gives the steps of the Share menu on an iPhone', () => {
    const iphone = fakeInstallHost('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    render(App, { ...base('app-pwa-ios'), installHost: iphone.host });

    expect(screen.getByText(fr.pwa.iosTitle)).toBeInTheDocument();
  });
});

describe('App, new version', () => {
  it('offers the new version with the version in use, and updates only on a click', async () => {
    const user = userEvent.setup();
    const { updates, applyUpdate, publish } = fakeUpdates();
    render(App, { ...base('app-pwa-update'), updates });

    publish();
    const banner = await screen.findByRole('complementary', { name: fr.pwa.updateTitle });
    expect(banner).toHaveTextContent(`la version ${packageJson.version}`);
    expect(applyUpdate).not.toHaveBeenCalled();

    await user.click(within(banner).getByRole('button', { name: fr.pwa.update }));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('never interrupts a study session, and shows the banner after it', async () => {
    const user = userEvent.setup();
    const { updates, publish } = fakeUpdates();
    render(App, { ...base('app-pwa-update-session'), updates });
    await user.click(screen.getByRole('button', { name: fr.nav.flashcards }));

    publish();
    await screen.findByRole('region', { name: fr.flashcards.title });
    expect(
      screen.queryByRole('complementary', { name: fr.pwa.updateTitle }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: fr.nav.home }));
    expect(
      await screen.findByRole('complementary', { name: fr.pwa.updateTitle }),
    ).toBeInTheDocument();
  });

  it('can be put off until the next start', async () => {
    const user = userEvent.setup();
    const { updates, publish } = fakeUpdates();
    render(App, { ...base('app-pwa-update-later'), updates });
    publish();

    await user.click(await screen.findByRole('button', { name: fr.pwa.updateLater }));

    expect(
      screen.queryByRole('complementary', { name: fr.pwa.updateTitle }),
    ).not.toBeInTheDocument();
  });
});

describe('App, privacy', () => {
  it('opens the privacy page from the foot of the menu', async () => {
    const user = userEvent.setup();
    render(App, base('app-pwa-privacy-menu'));

    const link = within(screen.getByRole('contentinfo')).getByRole('button', {
      name: fr.privacy.link,
    });
    await user.click(link);

    expect(screen.getByRole('region', { name: fr.privacy.title })).toBeVisible();
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('opens the privacy page from the settings', async () => {
    const user = userEvent.setup();
    render(App, base('app-pwa-privacy-settings'));
    await user.click(screen.getByRole('button', { name: fr.nav.settings }));

    const settings = screen.getByRole('region', { name: fr.privacy.settingsTitle });
    await user.click(within(settings).getByRole('button', { name: fr.privacy.link }));

    expect(screen.getByRole('region', { name: fr.privacy.title })).toHaveTextContent(
      `Page valable pour la version ${packageJson.version}.`,
    );
  });
});
