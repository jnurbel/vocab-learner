import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './ui/theme.css';
import './app/app.css';
import './ui/components.css';
import App from './app/App.svelte';
import { appUpdatesFrom } from './services/pwa/appUpdates';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Mount point #app not found');
}

// The service worker makes the app installable and usable offline; a no-op on the dev server.
const updates = appUpdatesFrom(registerSW);

export default mount(App, { target, props: { updates } });
