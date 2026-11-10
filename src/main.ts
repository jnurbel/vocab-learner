import { mount } from 'svelte';
import './ui/theme.css';
import './app/app.css';
import './ui/components.css';
import ProfileRoot from './app/ProfileRoot.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Mount point #app not found');
}

// Each profile opens its own app, on its own database (DESIGN §3).
export default mount(ProfileRoot, { target });
